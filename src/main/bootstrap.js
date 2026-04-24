import http from "node:http";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { pool } from "../infra/db/pool.js";
import { disconnectSharedRedis } from "../infra/redis/sharedRedis.js";
import { withRetry } from "../utils/withRetry.js";
import { createAppContext } from "./composition.js";
import { createExpressApp } from "./server.js";

/**
 * Purpose: This file starts the application server.
 * It checks database connectivity, builds app context, starts HTTP,
 * and logs startup errors clearly.
 */

/** @type {import("node:http").Server | null} */
let server = null;

function installGracefulShutdown() {
  const shutdown = async (signal) => {
    logger.info({ signal }, "Shutdown signal received; draining HTTP connections");
    if (!server) {
      process.exit(0);
      return;
    }
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
    server = null;
    try {
      await disconnectSharedRedis();
    } catch (err) {
      logger.warn({ err }, "Cache disconnect during shutdown");
    }
    try {
      await pool.end();
    } catch (err) {
      logger.warn({ err }, "Pool end during shutdown");
    }
    logger.info("Graceful shutdown complete");
    process.exit(0);
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

async function main() {
  await withRetry(() => pool.query("select 1 as ok"), {
    attempts: env.SERVER_DB_RETRY_ATTEMPTS,
    baseDelayMs: env.SERVER_DB_RETRY_BASE_DELAY_MS,
    maxDelayMs: env.SERVER_DB_RETRY_MAX_DELAY_MS,
    event: "server_start_db_retry"
  });

  if (env.NODE_ENV === "production" && !env.REDIS_URL) {
    logger.warn(
      "REDIS_URL is not set: rate limits use per-process memory and catalog has no shared cache. " +
        "Set REDIS_URL when running multiple instances or for shared rate-limit state."
    );
  }

  const ctx = createAppContext();
  const app = createExpressApp(ctx);
  server = http.createServer(app);

  installGracefulShutdown();

  await new Promise((resolve, reject) => {
    server.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, "Server is running and healthy");
      resolve();
    });
    server.on("error", reject);
  });
}

async function startWithRetry() {
  await withRetry(() => main(), {
    attempts: env.SERVER_START_RETRY_ATTEMPTS,
    baseDelayMs: env.SERVER_START_RETRY_BASE_DELAY_MS,
    maxDelayMs: env.SERVER_START_RETRY_MAX_DELAY_MS,
    event: "server_start_retry",
    retryIf: (err) => {
      const code = String(err?.code || err?.cause?.code || "");
      if (code === "EADDRINUSE") return false;
      return (
        code === "ECONNREFUSED" ||
        code === "ETIMEDOUT" ||
        code === "ECONNRESET" ||
        code === "EAI_AGAIN" ||
        code === "ENOTFOUND"
      );
    }
  });
}

startWithRetry().catch((err) => {
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
