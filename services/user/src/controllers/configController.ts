import { Request, Response } from "express";
import { loadConfig, getCognitoConfig, getJwtConfig } from "../utils/config";
import { debug } from "../utils/debug";

export async function getConfig(req: Request, res: Response) {
  debug("--- getConfig() ---");
  try {
    await loadConfig();
    const config = getCognitoConfig();
    const jwtConfig = getJwtConfig();

    const origin = req.headers.origin || req.headers.referer || "";
    const redirectUri = origin ? `${new URL(origin).origin}/callback` : "";

    // Explicitly set CORS headers (CORS middleware should handle this, but this ensures it works)
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");

    res.json({
      cognitoDomain: config.domain,
      cognitoClientId: config.clientId,
      cognitoRegion: jwtConfig.region,
      redirectUri,
    });
  } catch {
    // Ensure CORS headers are included in error responses too
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.status(500).json({ error: "Failed to load configuration" });
  }
}
