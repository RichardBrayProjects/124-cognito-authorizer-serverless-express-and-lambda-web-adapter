import express, { Request, Response, Application } from "express";
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

// Middleware to extract API Gateway event from Lambda Web Adapter
// Lambda Web Adapter passes the API Gateway event via x-amzn-request-context header
app.use((req: any, _res, next) => {
  // Lambda Web Adapter passes the full API Gateway event in x-amzn-request-context header
  const requestContextHeader = req.headers['x-amzn-request-context'];
  if (requestContextHeader) {
    try {
      // Parse the request context from the header
      const requestContext = JSON.parse(requestContextHeader);
      
      req.apiGateway = {
        event: {
          requestContext: requestContext,
        },
      };
      
      // For RestApi (API Gateway v1), the authorizer is at the top level of requestContext
      // (not nested under requestContext.authorizer)
      if ((requestContext as any).authorizer) {
        req.apiGateway.event.requestContext.authorizer = (requestContext as any).authorizer;
      }
    } catch (error) {
      console.error("app.ts: Error parsing x-amzn-request-context header:", error);
    }
  }
  next();
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "image-service" });
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

// Export as default for Lambda Web Adapter
export default app;
