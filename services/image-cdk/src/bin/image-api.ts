#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ImageApiStack } from "../lib/imageApiStack";

const app = new cdk.App();

const domainName: string | undefined = process.env.UPTICK_DOMAIN_NAME;
const hostedZoneName = process.env.UPTICK_ZONE_NAME;
const hostedZoneId = process.env.UPTICK_ZONE_ID;
const apiSubdomain = process.env.UPTICK_IMAGE_API_SUBDOMAIN;

if (!hostedZoneId || !hostedZoneName || !domainName || !apiSubdomain) {
  throw new Error(
    "Missing environment variable(s): UPTICK_ZONE_ID UPTICK_ZONE_NAME UPTICK_DOMAIN_NAME UPTICK_IMAGE_API_SUBDOMAIN must be set."
  );
}

// CDK will automatically use the default region from AWS config if env is not specified
// ImageApiStack will automatically import the user pool from SSM if userPool is not provided
const imageApiStack = new ImageApiStack(app, "image-api", {
  domainName,
  hostedZoneName,
  hostedZoneId,
  apiSubdomain,
  // userPool is optional - will be imported from SSM if not provided
});
