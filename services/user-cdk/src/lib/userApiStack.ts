import { Construct } from "constructs";
import {
  Stack,
  StackProps,
  Duration,
  CfnOutput,
  RemovalPolicy,
} from "aws-cdk-lib";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import {
  RestApi,
  DomainName,
  EndpointType,
  SecurityPolicy,
  LambdaIntegration,
  MockIntegration,
  CognitoUserPoolsAuthorizer,
  AuthorizationType,
  GatewayResponse,
  ResponseType,
} from "aws-cdk-lib/aws-apigateway";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import {
  HostedZone,
  ARecord,
  AaaaRecord,
  RecordTarget,
} from "aws-cdk-lib/aws-route53";
import { ApiGatewayDomain } from "aws-cdk-lib/aws-route53-targets";
import {
  Certificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";
import * as iam from "aws-cdk-lib/aws-iam";

interface UserApiStackProps extends StackProps {
  domainName?: string;
  hostedZoneId?: string;
  hostedZoneName?: string;
  apiSubdomain?: string;
  userPool: UserPool;
}

export class UserApiStack extends Stack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: UserApiStackProps) {
    super(scope, id, props);

    const { domainName, hostedZoneId, hostedZoneName, apiSubdomain } = props;

    if (!hostedZoneName || !hostedZoneId || !domainName) {
      throw new Error(
        "Unexpected missing hostedZone || hostedZoneId || domainName"
      );
    }

    const apiDomainName = `${apiSubdomain}.${domainName}`;
    this.apiUrl = `https://${apiDomainName}`;

    const zone = HostedZone.fromHostedZoneAttributes(
      this,
      "ImportedHostedZone",
      {
        hostedZoneId,
        zoneName: hostedZoneName,
      }
    );

    // Create certificate for API subdomain
    const certificate = new Certificate(this, "ApiCertificate", {
      domainName: apiDomainName,
      validation: CertificateValidation.fromDns(zone),
    });
    // Retain certificate on stack deletion to avoid deletion failures
    // when it's still attached to API Gateway domain
    certificate.applyRemovalPolicy(RemovalPolicy.RETAIN);

    // Create Lambda function using NodejsFunction for automatic bundling
    // Uses @vendia/serverless-express to run Express app on Lambda
    // Entry path is relative to the CDK project root (services/user-cdk)
    // From services/user-cdk, ../user/src/index.ts resolves to services/user/src/index.ts
    const lambdaFunction = new NodejsFunction(this, "UserServiceFunction", {
      entry: "../user/src/index.ts",
      handler: "handler",
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      bundling: {
        minify: true,
        sourceMap: false,
        target: "es2021",
        nodeModules: ["express", "cors", "@vendia/serverless-express"],
      },
      environment: {
        API_URL: this.apiUrl,
        // Note: AWS_REGION is automatically set by Lambda runtime, don't set it manually
      },
    });

    // Grant Lambda access to SSM parameters for Cognito config
    lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/cognito/*`,
        ],
      })
    );

    // Create API Gateway
    const api = new RestApi(this, "UserApi", {
      restApiName: "User Service API",
      description: "API Gateway for User Service",
      endpointConfiguration: {
        types: [EndpointType.REGIONAL],
      },
    });

    // Create custom domain
    const apiDomain = new DomainName(this, "ApiDomain", {
      domainName: apiDomainName,
      certificate: certificate,
      securityPolicy: SecurityPolicy.TLS_1_2,
      endpointType: EndpointType.REGIONAL,
    });

    // Create base path mapping
    apiDomain.addBasePathMapping(api, {
      basePath: "",
    });

    // Create Route53 records
    new ARecord(this, "ApiARecord", {
      zone,
      recordName: apiSubdomain,
      target: RecordTarget.fromAlias(new ApiGatewayDomain(apiDomain)),
    });

    new AaaaRecord(this, "ApiAaaaRecord", {
      zone,
      recordName: apiSubdomain,
      target: RecordTarget.fromAlias(new ApiGatewayDomain(apiDomain)),
    });

    // Create Cognito authorizer
    const authorizer = new CognitoUserPoolsAuthorizer(
      this,
      "CognitoAuthorizer",
      {
        cognitoUserPools: [props.userPool],
        identitySource: "method.request.header.Authorization",
      }
    );

    const lambdaIntegration = new LambdaIntegration(lambdaFunction, {
      proxy: true,
    });

    // Create a MockIntegration for OPTIONS requests (CORS preflight)
    const corsMockIntegration = new MockIntegration({
      integrationResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Origin": "'*'",
            "method.response.header.Access-Control-Allow-Headers": "'Content-Type,Authorization'",
            "method.response.header.Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
          },
        },
      ],
      requestTemplates: {
        "application/json": '{"statusCode": 200}',
      },
    });

    const corsMethodOptions = {
      methodResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Origin": true,
            "method.response.header.Access-Control-Allow-Headers": true,
            "method.response.header.Access-Control-Allow-Methods": true,
          },
        },
      ],
    };

    const v1Resource = api.root.addResource("v1");
    
    const configResource = v1Resource.addResource("config");
    configResource.addMethod("GET", lambdaIntegration, {
      authorizationType: AuthorizationType.NONE,
      methodResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Origin": true,
            "method.response.header.Access-Control-Allow-Headers": true,
            "method.response.header.Access-Control-Allow-Methods": true,
          },
        },
      ],
    });
    // Add OPTIONS for config (though not strictly necessary, it's good practice)
    configResource.addMethod("OPTIONS", corsMockIntegration, {
      ...corsMethodOptions,
      authorizationType: AuthorizationType.NONE,
    });

    const profileResource = v1Resource.addResource("profile");
    profileResource.addMethod("GET", lambdaIntegration, {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: authorizer,
    });
    // Add OPTIONS method for CORS preflight (no auth required)
    profileResource.addMethod("OPTIONS", corsMockIntegration, {
      ...corsMethodOptions,
      authorizationType: AuthorizationType.NONE,
    });

    const adminResource = v1Resource.addResource("admin");
    adminResource.addProxy({
      defaultIntegration: lambdaIntegration,
      defaultMethodOptions: {
        authorizationType: AuthorizationType.COGNITO,
        authorizer: authorizer,
      },
    });
    // Add OPTIONS method for admin CORS preflight (no auth required)
    adminResource.addMethod("OPTIONS", corsMockIntegration, {
      ...corsMethodOptions,
      authorizationType: AuthorizationType.NONE,
    });

    api.root.addResource("health").addMethod("GET", lambdaIntegration, {
      authorizationType: AuthorizationType.NONE,
    });

    // Removed catch-all proxy to avoid conflicts with specific routes
    // All routes should be explicitly defined above

    // Add gateway responses with CORS headers for authorizer errors
    // This ensures CORS headers are present even when API Gateway rejects requests before they reach Lambda
    api.addGatewayResponse("UnauthorizedGatewayResponse", {
      type: ResponseType.UNAUTHORIZED,
      statusCode: "401",
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'Content-Type,Authorization'",
        "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
      },
    });

    api.addGatewayResponse("AccessDeniedGatewayResponse", {
      type: ResponseType.ACCESS_DENIED,
      statusCode: "403",
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'Content-Type,Authorization'",
        "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
      },
    });

    new CfnOutput(this, "ApiUrl", {
      value: `https://${apiDomainName}`,
    });

    new CfnOutput(this, "ApiGatewayUrl", {
      value: api.url,
    });
  }
}
