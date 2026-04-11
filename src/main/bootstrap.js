import http from "node:http";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { pool } from "../infra/db/pool.js";
import { attachSocketServer } from "../infra/realtime/socketServer.js";
import { createAppContext } from "./composition.js";
import { createExpressApp } from "./server.js";

/**
 * Purpose: This file starts the application server.
 * It checks database connectivity, builds app context, starts HTTP,
 * and logs startup errors clearly.
 */
async function main() {
  await pool.query("select 1 as ok");

  if (env.NODE_ENV === "production" && !env.REDIS_URL) {
    logger.warn(
      "REDIS_URL is not set: rate limits use per-process memory and catalog has no Redis cache. " +
        "Set REDIS_URL when running multiple instances or for shared rate-limit state."
    );
  }

  const ctx = createAppContext();
  const app = createExpressApp(ctx);
  const server = http.createServer(app);
  const realtime = attachSocketServer(server, { corsOrigin: env.CORS_ORIGIN });
  ctx.emitOrderPlaced = (payload) => realtime.emitOrderPlaced(payload);

  await new Promise((resolve, reject) => {
    server.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, "Server is running and healthy");
      resolve();
    });
    server.on("error", reject);
  });
}

main().catch((err) => {
  if (err?.code === "EADDRINUSE") {
    logger.error(
      { port: env.PORT },
      "Port already in use — stop the other process (e.g. lsof -i :PORT) or change PORT in .env"
    );
  } else if (err?.code === "ECONNREFUSED" || err?.cause?.code === "ECONNREFUSED") {
    logger.error("Cannot reach PostgreSQL — ensure the server is running and DATABASE_URL in .env is correct");
  }
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
