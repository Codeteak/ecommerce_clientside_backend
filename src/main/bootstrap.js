import http from "node:http";
import { env } from "../config/env.js";
import { buildReadCacheStartupStatus } from "../config/env/readCacheTtl.js";
import { logger } from "../config/logger.js";
import { pool } from "../infra/db/pool.js";
import { disconnectSharedRedis, getSharedRedisClient } from "../infra/redis/sharedRedis.js";
import { createRealtimeServer } from "../infra/realtime/createRealtimeServer.js";
import { withRetry } from "../utils/withRetry.js";
import { closeServerWithTimeout } from "../utils/gracefulShutdown.js";
import { initSentry } from "../infra/observability/sentry.js";
import { createAppContext } from "./composition.js";
import { createExpressApp } from "./server.js";
import { installFatalProcessHandlers } from "../utils/installFatalProcessHandlers.js";
import { startOutboxPoller } from "../infra/outbox/startOutboxPoller.js";
import { warmupRateLimitRedis } from "../interface/http/middleware/createLimiter.js";

/**
 * Purpose: This file starts the application server.
 * It checks database connectivity, builds app context, starts HTTP,
 * and logs startup errors clearly.
 */

/** @type {import("node:http").Server | null} */
let server = null;
/** @type {{ close?: () => Promise<void> } | null} */
let realtimeServer = null;
/** @type {ReturnType<typeof startOutboxPoller> | null} */
let outboxPoller = null;

function installGracefulShutdown() {
  const shutdown = async (signal) => {
    logger.info({ signal, event: "shutdown.started" }, "Shutdown signal received; draining HTTP connections");
    if (!server) {
      process.exit(0);
      return;
    }
    const result = await closeServerWithTimeout(server, env.SHUTDOWN_TIMEOUT_MS);
    if (result === "timeout") {
      logger.warn(
        { event: "shutdown.forced", timeoutMs: env.SHUTDOWN_TIMEOUT_MS },
        "HTTP drain timed out; continuing shutdown"
      );
    }
    server = null;
    if (outboxPoller) {
      outboxPoller.stop();
      try {
        await Promise.race([
          outboxPoller.stopped,
          new Promise((resolve) => setTimeout(resolve, env.SHUTDOWN_TIMEOUT_MS))
        ]);
      } catch (err) {
        logger.warn({ err, event: "shutdown.outbox_failed" }, "Outbox poller stop during shutdown");
      }
      outboxPoller = null;
    }
    if (realtimeServer?.close) {
      try {
        await realtimeServer.close();
      } catch (err) {
        logger.warn({ err, event: "shutdown.realtime_failed" }, "Realtime close during shutdown");
      }
      realtimeServer = null;
    }
    try {
      await disconnectSharedRedis();
    } catch (err) {
      logger.warn({ err, event: "shutdown.redis_failed" }, "Cache disconnect during shutdown");
    }
    try {
      await pool.end();
    } catch (err) {
      logger.warn({ err, event: "shutdown.pool_failed" }, "Pool end during shutdown");
    }
    logger.info({ event: "shutdown.complete" }, "Graceful shutdown complete");
    process.exit(0);
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

async function main() {
  initSentry();

  await withRetry(() => pool.query("select 1 as ok"), {
    attempts: env.SERVER_DB_RETRY_ATTEMPTS,
    baseDelayMs: env.SERVER_DB_RETRY_BASE_DELAY_MS,
    maxDelayMs: env.SERVER_DB_RETRY_MAX_DELAY_MS,
    event: "server_start_db_retry"
  });

  await warmupRateLimitRedis();

  const ctx = createAppContext();
  const app = createExpressApp(ctx);
  server = http.createServer(app);

  if (env.REALTIME_ENABLED) {
    const redis = getSharedRedisClient();
    if (!redis) {
      logger.warn(
        { event: "realtime.disabled_no_redis" },
        "REALTIME_ENABLED but Redis unavailable; order.placed emits will no-op"
      );
    } else {
      realtimeServer = await createRealtimeServer(server, { redis, logger });
      ctx.emitOrderPlaced = realtimeServer.emitOrderPlaced;
      logger.info({ event: "realtime.enabled" }, "Socket.IO realtime server attached");
    }
  }

  installGracefulShutdown();

  await new Promise((resolve, reject) => {
    server.listen(env.PORT, () => {
      const cache = buildReadCacheStartupStatus(env);
      logger.info(
        {
          port: env.PORT,
          event: "server.started",
          cacheOn: cache.cacheOn,
          redisConfigured: cache.redisConfigured,
          readCachesActive: cache.readCachesActive,
          cacheTtlSec: cache.effectiveTtlSec
        },
        `Server is running on port ${env.PORT} — ${cache.summary}`
      );
      resolve();
    });
    server.on("error", reject);
  });

  if (env.OUTBOX_WORKER_ENABLED) {
    outboxPoller = startOutboxPoller({
      pool,
      logger,
      embedded: true,
      emitOrderPlaced:
        typeof ctx.emitOrderPlaced === "function" ? ctx.emitOrderPlaced.bind(ctx) : undefined
    });
  }
}

installFatalProcessHandlers(logger, { skip: env.NODE_ENV === "test" });

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
