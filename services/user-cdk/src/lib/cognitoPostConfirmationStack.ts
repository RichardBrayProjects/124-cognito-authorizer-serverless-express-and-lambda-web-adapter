import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { join } from 'path';
import * as iam from 'aws-cdk-lib/aws-iam';

interface CognitoPostConfirmationStackProps extends StackProps {
  systemName: string;
  dbname: string;
}

export class CognitoPostConfirmationStack extends Stack {
  public readonly postConfirmationLambda: NodejsFunction;

  constructor(
    scope: Construct,
    id: string,
    props: CognitoPostConfirmationStackProps
  ) {
    super(scope, id, props);

    const { systemName, dbname } = props;

    const uniquePrefix = `${systemName}-post-confirmation`;

    // Build environment variables
    const environment: Record<string, string> = {
      RDS_DB_NAME: dbname,
    };

    // Note: Lambda is not configured with VPC settings because:
    // 1. RDS instance is publicly accessible (publiclyAccessible: true)
    // 2. RDS security group allows PostgreSQL from anywhere (0.0.0.0/0)
    // 3. Lambda can connect to public RDS endpoints without VPC configuration
    // If RDS becomes private-only in the future, add VPC configuration here:
    // vpc: vpc, vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }, securityGroups: [lambdaSg]
    this.postConfirmationLambda = new NodejsFunction(this, uniquePrefix, {
      entry: join(__dirname, '..', 'lambdas', 'postConfirmation.ts'),
      handler: 'handler',
      functionName: uniquePrefix,
      runtime: Runtime.NODEJS_20_X,
      environment,
      bundling: {
        nodeModules: ['pg', '@aws-sdk/client-ssm'],
      },
    });

    // Grant Lambda access to SSM to read RDS secret ARN
    this.postConfirmationLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/rds/secret-arn`,
        ],
      })
    );

    // Grant Lambda access to Secrets Manager for RDS credentials
    // Note: We grant access to all secrets matching the pattern since we read the ARN at runtime
    // AWS Secrets Manager ARN format: arn:aws:secretsmanager:region:account:secret:name-6RandomChars
    // For secret name "system-rds/rds-credentials", the ARN is: secret:system-rds/rds-credentials-6RandomChars
    // Using wildcard pattern to match the 6 random characters suffix
    this.postConfirmationLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:system-rds/rds-credentials*`,
        ],
      })
    );

    new CfnOutput(this, 'PostConfirmationLambdaArn', {
      value: this.postConfirmationLambda.functionArn,
    });
  }
}
