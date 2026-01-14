import serverlessExpress from "@vendia/serverless-express";
import { app } from "./app";

// Store event globally so middleware can access it
// serverless-express should attach event to req.apiGateway.event, but it's not working
// So we'll manually attach it in middleware
(global as any).currentApiGatewayEvent = null;

// Create serverless-express handler
const serverlessHandler = serverlessExpress({ app });

// Wrap handler to store event globally before passing to serverless-express
export const handler = (event: any, context: any, callback?: any) => {
  // Store event globally so middleware can access it
  (global as any).currentApiGatewayEvent = event;
  
  // Call serverless-express handler
  return serverlessHandler(event, context, callback);
};

// Add logging to verify handler is being called
console.log("Lambda handler initialized");

