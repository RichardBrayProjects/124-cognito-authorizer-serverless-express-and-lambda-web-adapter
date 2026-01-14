import {
  CfnManagedLoginBranding,
  OAuthScope,
  UserPool,
  CfnUserPoolGroup,
} from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

interface CognitoStackProps extends StackProps {
  systemName: string;
  postConfirmationLambda: NodejsFunction;
  apiUrl: string; // The user API URL for callback URLs
  cloudfrontUrl: string; // The frontend URL for redirects
}

export class CognitoStack extends Stack {
  public readonly userPool: UserPool;

  constructor(scope: Construct, id: string, props: CognitoStackProps) {
    super(scope, id, props);

    const { systemName, postConfirmationLambda, apiUrl, cloudfrontUrl } = props;
    const uniquePrefix = `${systemName}`.replaceAll(".", "-");

    this.userPool = new UserPool(this, "uptick-userpool", {
      userPoolName: "uptick-userpool",
      removalPolicy: RemovalPolicy.DESTROY,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        phoneNumber: {
          required: false,
          mutable: true,
        },
      },
      selfSignUpEnabled: true,
      lambdaTriggers: {
        postConfirmation: postConfirmationLambda,
      },
    });

    // Note: RDS secret access is granted in CognitoPostConfirmationStack
    // The Lambda reads the secret ARN from SSM at runtime

    this.userPool.addDomain(`${uniquePrefix}-domain`, {
      cognitoDomain: {
        domainPrefix: uniquePrefix,
      },
      managedLoginVersion: 2,
    });

    // Callback URLs now point to SPA, not backend
    const callbackUrls = [
      `${cloudfrontUrl}/callback`,
      `http://localhost:3000/callback`,
    ];
    const logoutUrls = [
      cloudfrontUrl,
      `http://localhost:3000`,
    ];

    const webServerClient = this.userPool.addClient(
      "uptick-web-server-client",
      {
        userPoolClientName: "uptick-web-server-client",
        oAuth: {
          flows: { authorizationCodeGrant: true },
          scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PHONE],
          callbackUrls,
          logoutUrls,
        },
        // Public client for PKCE - no secret needed
        // PKCE provides security through code_verifier instead
        generateSecret: false,
      }
    );

    new CfnManagedLoginBranding(
      this,
      "uptick-web-server-managed-login-branding",
      {
        userPoolId: this.userPool.userPoolId,
        clientId: webServerClient.userPoolClientId,
        returnMergedResources: true,
        settings: {
          components: {
            primaryButton: {
              lightMode: {
                defaults: {
                  backgroundColor: "0972d3ff",
                  textColor: "ffffffff",
                },
                hover: {
                  backgroundColor: "033160ff",
                  textColor: "ffffffff",
                },
                active: {
                  backgroundColor: "033160ff",
                  textColor: "ffffffff",
                },
              },
              darkMode: {
                defaults: {
                  backgroundColor: "539fe5ff",
                  textColor: "000716ff",
                },
                hover: {
                  backgroundColor: "89bdeeff",
                  textColor: "000716ff",
                },
                active: {
                  backgroundColor: "539fe5ff",
                  textColor: "000716ff",
                },
              },
            },
            pageBackground: {
              lightMode: {
                color: "ffffffff",
              },
              darkMode: {
                color: "044444ff",
              },
              image: {
                enabled: false,
              },
            },
          },
          categories: {
            auth: {
              authMethodOrder: [
                [
                  {
                    display: "BUTTON",
                    type: "FEDERATED",
                  },
                  {
                    display: "INPUT",
                    type: "USERNAME_PASSWORD",
                  },
                ],
              ],
              federation: {
                interfaceStyle: "BUTTON_LIST",
                order: [],
              },
            },
            global: {
              colorSchemeMode: "DARK",
              pageHeader: {
                enabled: false,
              },
              pageFooter: {
                enabled: false,
              },
            },
          },
        },
      }
    );

    const cognitoDomain = `https://${uniquePrefix}.auth.${this.region}.amazoncognito.com`;
    const logoutEndpoint = `${cognitoDomain}/logout?client_id=${webServerClient.userPoolClientId}`;

    new StringParameter(this, "cognito-logout-endpoint-parameter", {
      parameterName: "/cognito/logout-endpoint",
      stringValue: logoutEndpoint,
    });

    new StringParameter(this, "cognito-domain-parameter", {
      parameterName: "/cognito/domain",
      stringValue: cognitoDomain,
      description: "Cognito domain URL",
    });

    const clientId = webServerClient.userPoolClientId;
    new StringParameter(this, "cognito-client-id-parameter", {
      parameterName: "/cognito/client-id",
      stringValue: clientId,
    });

    // Note: No client secret stored - using public client for PKCE
    // PKCE provides security through code_verifier instead of client secret

    // Store user pool ID in SSM for JWT verification
    new StringParameter(this, "cognito-user-pool-id-parameter", {
      parameterName: "/cognito/user-pool-id",
      stringValue: this.userPool.userPoolId,
      description: "Cognito User Pool ID for JWT verification",
    });

    // Create administrators group
    new CfnUserPoolGroup(this, "AdministratorsGroup", {
      userPoolId: this.userPool.userPoolId,
      groupName: "administrators",
      description: "Administrator users with elevated permissions",
    });

    // Store API URL and frontend URL in SSM for backend service to use
    new StringParameter(this, "api-url-parameter", {
      parameterName: "/cognito/api-url",
      stringValue: apiUrl,
      description: "User API URL for OAuth callbacks",
    });

    new StringParameter(this, "cloudfront-url-parameter", {
      parameterName: "/cognito/cloudfront-url",
      stringValue: cloudfrontUrl,
      description: "Frontend URL for OAuth redirects",
    });

    new CfnOutput(this, "cognito-logout-endpoint-output", {
      value: logoutEndpoint,
    });
    new CfnOutput(this, "cognito-client-id-output", { value: clientId });
    new CfnOutput(this, "callbackURLs", {
      value: JSON.stringify(callbackUrls),
    });
    new CfnOutput(this, "logoutURLs", {
      value: JSON.stringify(logoutUrls),
    });
  }
}
