import "express";
import type { AuthUser } from "../middleware/auth";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
      apiGateway?: {
        event: {
          requestContext: {
            authorizer?: {
              claims?: {
                sub?: string;
                email?: string;
                "cognito:groups"?: string | string[];
              };
            };
          };
        };
      };
    }
  }
}

export interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
}

export interface CognitoUserInfo {
  sub?: string;
  name?: string;
  preferred_username?: string;
  username?: string;
  email?: string;
}

export {};
