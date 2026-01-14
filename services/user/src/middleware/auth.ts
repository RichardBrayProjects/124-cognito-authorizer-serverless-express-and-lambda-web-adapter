import { Request, Response, NextFunction } from "express";

export interface AuthUser {
  sub: string;
  email?: string;
  groups: string[];
}

interface ApiGatewayEvent {
  requestContext: {
    authorizer?: {
      claims?: {
        sub?: string;
        email?: string;
        "cognito:groups"?: string | string[];
      };
    };
  };
}

interface ExtendedRequest extends Request {
  apiGateway?: {
    event: ApiGatewayEvent;
  };
}

export function attachAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const extendedReq = req as ExtendedRequest;
  
  // Extract claims from API Gateway event
  // For REST API with Cognito authorizer, claims are at event.requestContext.authorizer.claims
  // The event is manually attached to req.apiGateway.event by middleware in app.ts
  let event: any = null;
  if (extendedReq.apiGateway?.event) {
    event = extendedReq.apiGateway.event;
  } else if ((req as any).apiGateway?.event) {
    event = (req as any).apiGateway.event;
  } else {
    // Fallback: try to get from global (shouldn't be needed if middleware worked)
    const globalEvent = (global as any).currentApiGatewayEvent;
    if (globalEvent) {
      event = globalEvent;
      // Also attach it to req for consistency
      if (!req.apiGateway) {
        (req as any).apiGateway = {};
      }
      (req as any).apiGateway.event = event;
    }
  }
  
  // Extract claims from the event
  const claims = event?.requestContext?.authorizer?.claims;
  
  if (claims) {
    let groups: string[] = [];
    if (claims["cognito:groups"]) {
      if (typeof claims["cognito:groups"] === "string") {
        groups = claims["cognito:groups"].split(",").map((g) => g.trim());
      } else if (Array.isArray(claims["cognito:groups"])) {
        groups = claims["cognito:groups"];
      }
    }

    (req as any).auth = {
      sub: claims.sub || "",
      email: claims.email,
      groups,
    } as AuthUser;
  }

  next();
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const auth = (req as any).auth as AuthUser | undefined;
  if (!auth || !auth.sub) {
    // Ensure CORS headers are included in error responses
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

export function requireGroup(groupName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as any).auth as AuthUser | undefined;
    if (!auth || !auth.groups.includes(groupName)) {
      // Ensure CORS headers are included in error responses
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
