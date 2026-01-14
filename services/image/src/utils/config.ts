import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
const ssmClient = new SSMClient(region ? { region } : {});


let COGNITO_DOMAIN: string = "";
let CLIENT_ID: string = "";
let USER_POOL_ID: string = "";
let COGNITO_REGION: string = "";

export async function loadConfig() {
  if (COGNITO_DOMAIN) return;

  try {
    const clientId =
      (
        await ssmClient.send(
          new GetParameterCommand({ Name: "/cognito/client-id" })
        )
      ).Parameter?.Value ?? "";
    const cognitoDomain =
      (
        await ssmClient.send(
          new GetParameterCommand({ Name: "/cognito/domain" })
        )
      ).Parameter?.Value ?? "";
    
    const userPoolId =
      (
        await ssmClient.send(
          new GetParameterCommand({ Name: "/cognito/user-pool-id" })
        )
      ).Parameter?.Value ?? "";

    CLIENT_ID = clientId;
    COGNITO_DOMAIN = cognitoDomain;
    USER_POOL_ID = userPoolId;
    
    const domainMatch = cognitoDomain.match(/\.auth\.([^.]+)\.amazoncognito\.com/);
    COGNITO_REGION = domainMatch ? domainMatch[1] : (region || "");

  } catch {
    throw new Error("Failed to load configuration");
  }
}

export function getCognitoConfig() {
  return {
    domain: COGNITO_DOMAIN,
    clientId: CLIENT_ID,
  };
}

export function getJwtConfig() {
  if (!USER_POOL_ID || !COGNITO_REGION) {
    throw new Error("JWT config not loaded. Call loadConfig() first.");
  }
  
  const issuer = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${USER_POOL_ID}`;
  const jwksUri = `${issuer}/.well-known/jwks.json`;
  
  return {
    issuer,
    jwksUri,
    clientId: CLIENT_ID,
    userPoolId: USER_POOL_ID,
    region: COGNITO_REGION,
  };
}
