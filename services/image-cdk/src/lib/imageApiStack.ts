import { Construct } from "constructs";
import {
  Stack,
  StackProps,
  Duration,
  CfnOutput,
  RemovalPolicy,
} from "aws-cdk-lib";
import { DockerImageFunction, DockerImageCode } from "aws-cdk-lib/aws-lambda";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as path from "path";
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
import { StringParameter } from "aws-cdk-lib/aws-ssm";

interface ImageApiStackProps extends StackProps {
  domainName?: string;
  hostedZoneId?: string;
  hostedZoneName?: string;
  apiSubdomain?: string;
  userPool?: UserPool; // Optional - if not provided, will import from SSM
}

export class ImageApiStack extends Stack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ImageApiStackProps) {
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

    // Get project root directory for Docker build context
    const projectRootDir = path.resolve(__dirname, "../../../..");

    // Create Lambda function using Docker with Lambda Web Adapter
    // This matches the working example in 064-MONO project
    const lambdaFunction = new DockerImageFunction(this, "ImageServiceFunction", {
      code: DockerImageCode.fromImageAsset(projectRootDir, {
        file: "services/image/Dockerfile-adapter",
        platform: Platform.LINUX_AMD64,
        exclude: [
          "/**/cdk.out",
          "/**/node_modules",
          "/**/.pnpm-store",
          "/**/dist",
          "/**/coverage",
          "/**/.git",
          "/**/.next",
          "/**/build",
          "/**/*.log",
          "/**/tmp",
          "/**/temp",
        ],
      }),
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        API_URL: this.apiUrl,
        PORT: "3000",
        READINESS_CHECK_PATH: "/health",
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
    const api = new RestApi(this, "ImageApi", {
      restApiName: "Image Service API",
      description: "API Gateway for Image Service",
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

    // Get or import user pool
    // If userPool is provided, use it; otherwise import from SSM
    let userPool: UserPool;
    if (props.userPool) {
      userPool = props.userPool;
    } else {
      // Import user pool from SSM (stored by CognitoStack from user-cdk)
      const userPoolId = StringParameter.valueForStringParameter(
        this,
        "/cognito/user-pool-id"
      );
      userPool = UserPool.fromUserPoolId(this, "ImportedUserPool", userPoolId);
    }

    // Create Cognito authorizer
    const authorizer = new CognitoUserPoolsAuthorizer(
      this,
      "CognitoAuthorizer",
      {
        cognitoUserPools: [userPool],
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

    api.root.addProxy({
      defaultIntegration: lambdaIntegration,
      defaultMethodOptions: {
        authorizationType: AuthorizationType.COGNITO,
        authorizer: authorizer,
      },
    });

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
