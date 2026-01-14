import { Construct } from 'constructs';
import {
  Stack,
  StackProps,
  CfnOutput,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

// RDS requires DB subnet groups to span at least 2 Availability Zones.
// To minimize costs while meeting this requirement:
// - VPC configured with 2 AZs (creates subnets in both AZs for the subnet group)
// - RDS instance pinned to a single AZ via availabilityZone property
// - vpcSubnets spans both AZs (no AZ restriction) but instance only uses the specified AZ
// This avoids cross-AZ data transfer charges while satisfying AWS's subnet group requirement.

export class RdsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // --------------------------
    // VPC Configuration
    // --------------------------
    const vpc = new ec2.Vpc(this, 'RdsVpc', {
      maxAzs: 2, // Required for RDS subnet groups
      natGateways: 0, // Cost optimization: no NAT gateways
      subnetConfiguration: [
        { name: 'PublicSubnet', subnetType: ec2.SubnetType.PUBLIC },
      ],
    });

    // --------------------------
    // Security Group
    // --------------------------
    const rdsSecurityGroup = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for publicly accessible RDS instance',
    });

    rdsSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from anywhere (development only)'
    );

    // --------------------------
    // Database Credentials
    // --------------------------
    // RDS will automatically generate and manage the password in Secrets Manager
    const dbUsername = 'uptick_admin';
    const dbCredentials = rds.Credentials.fromGeneratedSecret(dbUsername, {
      secretName: `${this.stackName}/rds-credentials`,
      excludeCharacters: " %+~`#$&*()|[]{}:;<>?!'/@\"\\",
    });

    // --------------------------
    // Database Engine & Parameter Group
    // --------------------------
    const engine = rds.DatabaseInstanceEngine.postgres({
      version: rds.PostgresEngineVersion.VER_17_4,
    });

    const parameterGroup = new rds.ParameterGroup(this, 'CustomParameterGroup', {
      engine,
      parameters: {
        'rds.force_ssl': '0',
      },
    });

    // --------------------------
    // RDS Instance
    // --------------------------

    const dbInstance = new rds.DatabaseInstance(this, 'RdsDatabaseInstance', {
      engine,
      vpc,
      availabilityZone: vpc.availabilityZones[0],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE4_GRAVITON,
        ec2.InstanceSize.MICRO
      ),
      allocatedStorage: 20,
      maxAllocatedStorage: 20,
      storageType: rds.StorageType.GP2,
      credentials: dbCredentials,
      publiclyAccessible: true,
      multiAz: false,
      backupRetention: Duration.days(0),
      deleteAutomatedBackups: true,
      enablePerformanceInsights: false,
      monitoringInterval: Duration.seconds(0),
      securityGroups: [rdsSecurityGroup],
      parameterGroup,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --------------------------
    // SSM Parameters for External Tools
    // --------------------------
    // Store the secret ARN in SSM Parameter Store for external tools
    const secretArn = dbInstance.secret!.secretArn;
    new StringParameter(this, 'DbSecretArnParam', {
      parameterName: '/rds/secret-arn',
      stringValue: secretArn,
      description: 'ARN of the RDS credentials secret in Secrets Manager',
    });

    // --------------------------
    // Outputs
    // --------------------------
    new CfnOutput(this, 'RdsEndpoint', {
      value: dbInstance.instanceEndpoint.hostname,
      description: 'RDS instance endpoint hostname',
    });

    new CfnOutput(this, 'RdsPort', {
      value: dbInstance.instanceEndpoint.port.toString(),
      description: 'RDS instance port',
    });

    new CfnOutput(this, 'DbSecretArn', {
      value: secretArn,
      description: 'ARN of the RDS credentials secret in Secrets Manager',
    });

    new CfnOutput(this, 'RdsSecurityGroupId', {
      value: rdsSecurityGroup.securityGroupId,
      description: 'RDS security group ID',
    });

    new CfnOutput(this, 'VpcId', {
      value: vpc.vpcId,
      description: 'VPC ID',
    });
  }
}
