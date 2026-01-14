#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { CloudFrontStack } from "../lib/cloudfrontStack";

const app = new cdk.App();

const region = "us-east-1";

const domainName: string | undefined = process.env.UPTICK_DOMAIN_NAME;
const hostedZoneName = process.env.UPTICK_ZONE_NAME;
const hostedZoneId = process.env.UPTICK_ZONE_ID;
if (!hostedZoneId || !hostedZoneName || !domainName) {
  throw new Error(
    "Missing environment variable(s): UPTICK_ZONE_ID UPTICK_ZONE_NAME UPTICK_DOMAIN_NAME must be set."
  );
}

new CloudFrontStack(app, "system-cloudfront", {
  env: {
    region,
  },
  domainName,
  hostedZoneName,
  hostedZoneId,
});
