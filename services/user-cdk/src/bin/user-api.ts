#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { UserApiStack } from "../lib/userApiStack";
import { CognitoPostConfirmationStack } from "../lib/cognitoPostConfirmationStack";
import { CognitoStack } from "../lib/cognitoStack";

const app = new cdk.App();

const domainName: string | undefined = process.env.UPTICK_DOMAIN_NAME;
const hostedZoneName = process.env.UPTICK_ZONE_NAME;
const hostedZoneId = process.env.UPTICK_ZONE_ID;
const apiSubdomain = process.env.UPTICK_USER_API_SUBDOMAIN;
const dbname = process.env.UPTICK_DB_NAME;

if (!hostedZoneId || !hostedZoneName || !domainName || !apiSubdomain || !dbname) {
  throw new Error(
    "Missing environment variable(s): UPTICK_ZONE_ID UPTICK_ZONE_NAME UPTICK_DOMAIN_NAME UPTICK_USER_API_SUBDOMAIN UPTICK_DB_NAME must be set."
  );
}

// Derive frontend URL from domain name (e.g., if domain is uptickart.com, frontend is https://uptickart.com)
const cloudfrontUrl = `https://www.${domainName}`;

const systemName = 'uptickart';

// Create Cognito PostConfirmation stack
// This stack will automatically look up RDS secret ARN from SSM parameter /rds/secret-arn
const postConfirmationStack = new CognitoPostConfirmationStack(
  app,
  'user-cognito-post-confirmation-stack',
  {
    systemName,
    dbname,
  }
);

// Create Cognito stack first (needed for UserApiStack)
// This stack will automatically look up RDS secret ARN from SSM parameter /rds/secret-arn
const cognitoStack = new CognitoStack(app, 'user-cognito-stack', {
  systemName,
  postConfirmationLambda: postConfirmationStack.postConfirmationLambda,
  apiUrl: `https://${apiSubdomain}.${domainName}`, // Temporary URL, will be updated after UserApiStack is created
  cloudfrontUrl,
});

// CDK will automatically use the default region from AWS config if env is not specified
const userApiStack = new UserApiStack(app, "user-api", {
  domainName,
  hostedZoneName,
  hostedZoneId,
  apiSubdomain,
  userPool: cognitoStack.userPool,
});
