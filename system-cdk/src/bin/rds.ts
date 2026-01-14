#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { RdsStack } from '../lib/rdsStack';

const app = new cdk.App();

// Use default AWS account and region from AWS CLI configuration
// No explicit env specification - CDK will use default credentials
new RdsStack(app, 'system-rds');
