import express, { Request, Response, Application, NextFunction } from "express";
import cors from "cors";
import configRoutes from "./routes/configRoutes";
import profileRoutes from "./routes/profileRoutes";
import adminRoutes from "./routes/adminRoutes";
import "./utils/types";

const app: Application = express();

app.use(
  cors({
    origin: true,
    credentials: false,
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

// Explicit OPTIONS handler as fallback (CORS middleware should handle this, but this ensures it works)
app.options("*", (_req: Request, res: Response) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.sendStatus(200);
});

app.use(express.json());

// Middleware to manually attach API Gateway event to request
// serverless-express should attach event to req.apiGateway.event, but it's not working
// So we manually attach it from the global variable set in the handler
// This MUST run before any routes that need auth (like /v1/profile)
app.use((req: any, _res: Response, next: NextFunction) => {
  // Manually attach event from global variable
  const event = (global as any).currentApiGatewayEvent;
  if (event) {
    if (!req.apiGateway) {
      req.apiGateway = {};
    }
    req.apiGateway.event = event;
  }
  next();
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "user-service" });
});

app.use("/v1/config", configRoutes);
app.use("/v1/profile", profileRoutes);
app.use("/v1/admin", adminRoutes);

app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error("Error:", err);
  const status = err.status || 500;
  const message = err.message || "Internal server error";
  // Ensure CORS headers are included in error responses
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.status(status).json({ error: message });
});

// Export as named export (matching working pattern from 123-image-handling)
export { app };
export default app;
