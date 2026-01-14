import app from "./app";

const port = process.env.PORT || 3000;

// For Lambda Web Adapter (Docker), the app needs to listen on a port
// The adapter will route requests to this port
// This matches the working example in 064-MONO project
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// Handle SIGTERM for graceful shutdown
process.on('SIGTERM', () => {
  process.exit(0);
});

export default app;
