import { createServer } from "../../src/main/server.js";

let app;

/** Single Express app for HTTP tests (no listen). */
export function getTestApp() {
  if (!app) {
    app = createServer();
  }
  return app;
}
