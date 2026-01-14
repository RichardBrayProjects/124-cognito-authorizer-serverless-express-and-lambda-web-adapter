import { Request, Response } from "express";
import "../utils/types";
import { debug } from "../utils/debug";

export function getProfile(req: Request, res: Response) {
  debug("--- getProfile() ---");
  
  // Debug: Log the entire request structure to see what's available
  console.log("getProfile: req.apiGateway:", (req as any).apiGateway);
  console.log("getProfile: req.requestContext:", (req as any).requestContext);
  console.log("getProfile: req.event:", (req as any).event);
  console.log("getProfile: req.auth:", (req as any).auth);
  console.log("getProfile: req.headers:", req.headers);
  
  // Check if auth was set by middleware
  const auth = (req as any).auth;
  if (auth) {
    res.json({
      authenticated: true,
      user: {
        sub: auth.sub,
        email: auth.email,
        groups: auth.groups,
      },
      status: "ok",
      message: "Profile retrieved successfully",
      timestamp: new Date().toISOString(),
    });
  } else {
    // This shouldn't happen if middleware is working, but log it
    console.log("getProfile: WARNING - req.auth is not set, middleware may have failed");
    res.status(401).json({
      error: "Authentication required",
      debug: "req.auth was not set by middleware",
    });
  }
}
