import { PostConfirmationTriggerEvent } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { Client } from 'pg';

const RDS_DB_NAME = process.env.RDS_DB_NAME;
const RDS_SECRET_ARN_PARAMETER = '/rds/secret-arn';
const secretsClient = new SecretsManagerClient({});
const ssmClient = new SSMClient({});

async function getRdsSecretArn(): Promise<string> {
  // Read RDS secret ARN from SSM Parameter Store
  const ssmResponse = await ssmClient.send(
    new GetParameterCommand({ Name: RDS_SECRET_ARN_PARAMETER })
  );
  
  if (!ssmResponse.Parameter?.Value) {
    throw new Error(`SSM parameter ${RDS_SECRET_ARN_PARAMETER} not found or has no value`);
  }
  
  return ssmResponse.Parameter.Value;
}

async function getRdsCredentials() {
  // Get the secret ARN from SSM
  const rdsSecretArn = await getRdsSecretArn();

  // Get credentials from Secrets Manager
  const secretResponse = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: rdsSecretArn })
  );
  
  const secret = JSON.parse(secretResponse.SecretString || '{}');
  return {
    host: secret.host,
    port: secret.port || 5432,
    username: secret.username,
    password: secret.password,
  };
}

async function insertUserRDS(userData: { username: string; email: string }): Promise<void> {
  if (!RDS_DB_NAME || RDS_DB_NAME.trim() === '') {
    throw new Error('RDS_DB_NAME environment variable is required');
  }

  const credentials = await getRdsCredentials();
  const client = new Client({
    host: credentials.host,
    port: credentials.port,
    user: credentials.username,
    password: credentials.password,
    database: RDS_DB_NAME,
  });

  try {
    await client.connect();
    await client.query(
      `INSERT INTO users (username, email)
       VALUES ($1, $2)
       ON CONFLICT (username) DO NOTHING`,
      [userData.username, userData.email]
    );
    console.log(`User ${userData.username} inserted into RDS table.`);
  } finally {
    await client.end();
  }
}

export const handler = async (
  event: PostConfirmationTriggerEvent
): Promise<PostConfirmationTriggerEvent> => {
  console.log('PostConfirmation Trigger Fired for user:', event.userName);
  console.log('Full event:', JSON.stringify(event, null, 2));

  const userAttributes = event.request?.userAttributes;
  console.log(`User attributes:`, JSON.stringify(userAttributes));

  // event.userName is the most reliable source for username (always present)
  // It contains the user's unique identifier (sub) or username
  const username = event.userName;
  
  // Email should be in userAttributes.email (standard attribute)
  // Fallback to event.userName if email not found (though this shouldn't happen)
  const email = userAttributes?.email ?? event.userName;

  console.log(`Inserting into database username: ${username} email: ${email}`);

  try {
    // Insert into RDS database
    await insertUserRDS({ username, email });
    console.log(`User ${username} successfully created and inserted into database.`);
  } catch (err) {
    console.error('PostConfirmation handler error:', err);
    // Don't throw - allow Cognito to complete user creation even if DB insert fails
  }

  return event;
};
