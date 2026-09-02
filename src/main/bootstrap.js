import http from "node:http";
import { env } from "../config/env.js";
import { buildReadCacheStartupStatus } from "../config/env/readCacheTtl.js";
import { logger } from "../config/logger.js";
import {
  logStartupBanner,
  logStartupFailure,
  logStartupReady,
  logStartupSkip,
  logStartupStep,
  logStartupSuccess,
  maskDatabaseHost
} from "../config/startupLog.js";
import { pool } from "../infra/db/pool.js";
import { disconnectSharedRedis, getSharedRedisClient } from "../infra/redis/sharedRedis.js";
import { createRealtimeServer } from "../infra/realtime/createRealtimeServer.js";
import { withRetry } from "../utils/withRetry.js";
import { formatError } from "../utils/formatError.js";
import { closeServerWithTimeout } from "../utils/gracefulShutdown.js";
import { initSentry, isSentryEnabled } from "../infra/observability/sentry.js";
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
    logger.info(
      { signal, event: "shutdown.started" },
      `[shutdown.started] Received ${signal}; draining HTTP connections`
    );
    if (!server) {
      process.exit(0);
      return;
    }
    const result = await closeServerWithTimeout(server, env.SHUTDOWN_TIMEOUT_MS);
    if (result === "timeout") {
      logger.warn(
        { event: "shutdown.forced", timeoutMs: env.SHUTDOWN_TIMEOUT_MS },
        `[shutdown.forced] HTTP drain timed out after ${env.SHUTDOWN_TIMEOUT_MS}ms`
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
        logger.warn(
          { err, event: "shutdown.outbox_failed" },
          "[shutdown.outbox_failed] Outbox poller stop failed"
        );
      }
      outboxPoller = null;
    }
    if (realtimeServer?.close) {
      try {
        await realtimeServer.close();
      } catch (err) {
        logger.warn(
          { err, event: "shutdown.realtime_failed" },
          "[shutdown.realtime_failed] Realtime close failed"
        );
      }
      realtimeServer = null;
    }
    try {
      await disconnectSharedRedis();
    } catch (err) {
      logger.warn(
        { err, event: "shutdown.redis_failed" },
        "[shutdown.redis_failed] Redis disconnect failed"
      );
    }
    try {
      await pool.end();
    } catch (err) {
      logger.warn(
        { err, event: "shutdown.pool_failed" },
        "[shutdown.pool_failed] Database pool close failed"
      );
    }
    logger.info({ event: "shutdown.complete" }, "[shutdown.complete] Graceful shutdown finished");
    process.exit(0);
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

async function main() {
  logStartupBanner();

  logStartupStep("sentry", "Initializing error tracking (Sentry)…");
  initSentry();
  if (isSentryEnabled()) {
    logStartupSuccess("sentry", "Sentry enabled");
  } else {
    logStartupSkip("sentry", "Sentry disabled (no SENTRY_DSN or test env)");
  }

  logStartupStep("database", "Connecting to PostgreSQL…", {
    dbHost: maskDatabaseHost(env.DATABASE_URL)
  });
  await withRetry(() => pool.query("select 1 as ok"), {
    attempts: env.SERVER_DB_RETRY_ATTEMPTS,
    baseDelayMs: env.SERVER_DB_RETRY_BASE_DELAY_MS,
    maxDelayMs: env.SERVER_DB_RETRY_MAX_DELAY_MS,
    event: "startup.database.retry"
  });
  logStartupSuccess("database", "PostgreSQL connected", {
    dbHost: maskDatabaseHost(env.DATABASE_URL),
    poolMax: env.DATABASE_POOL_MAX
  });

  if (env.REDIS_URL && !env.DISABLE_RATE_LIMITING) {
    logStartupStep("redis", "Warming up Redis for rate limits…");
  } else {
    logStartupSkip(
      "redis",
      env.DISABLE_RATE_LIMITING
        ? "Rate limiting disabled — skipping Redis warmup"
        : "REDIS_URL unset — rate limits use in-memory store"
    );
  }
  await warmupRateLimitRedis();
  if (env.REDIS_URL && !env.DISABLE_RATE_LIMITING && getSharedRedisClient()?.status === "ready") {
    logStartupSuccess("redis", "Redis ready for rate limits");
  }

  logStartupStep("app", "Building application context and HTTP stack…");
  const ctx = createAppContext();
  const app = createExpressApp(ctx);
  server = http.createServer(app);
  logStartupSuccess("app", "Express application ready");

  if (env.REALTIME_ENABLED) {
    logStartupStep("realtime", "Attaching Socket.IO realtime server…");
    const redis = getSharedRedisClient();
    if (!redis) {
      logStartupSkip(
        "realtime",
        "REALTIME_ENABLED but Redis unavailable — order.placed emits will no-op"
      );
    } else {
      realtimeServer = await createRealtimeServer(server, { redis, logger });
      ctx.emitOrderPlaced = realtimeServer.emitOrderPlaced;
      logStartupSuccess("realtime", "Socket.IO realtime server attached");
    }
  } else {
    logStartupSkip("realtime", "Realtime disabled (REALTIME_ENABLED=false)");
  }

  installGracefulShutdown();

  logStartupStep("http", `Binding HTTP listener on port ${env.PORT}…`);
  await new Promise((resolve, reject) => {
    server.listen(env.PORT, () => {
      resolve();
    });
    server.on("error", reject);
  });

  const cache = buildReadCacheStartupStatus(env);
  logStartupReady(
    {
      port: env.PORT,
      nodeEnv: env.NODE_ENV,
      cacheOn: cache.cacheOn,
      redisConfigured: cache.redisConfigured,
      readCachesActive: cache.readCachesActive,
      cacheTtlSec: cache.effectiveTtlSec,
      outboxWorker: env.OUTBOX_WORKER_ENABLED,
      realtimeEnabled: env.REALTIME_ENABLED
    },
    `Server ready on http://localhost:${env.PORT} — ${cache.summary}`
  );

  if (env.OUTBOX_WORKER_ENABLED) {
    outboxPoller = startOutboxPoller({
      pool,
      logger,
      embedded: true,
      emitOrderPlaced:
        typeof ctx.emitOrderPlaced === "function" ? ctx.emitOrderPlaced.bind(ctx) : undefined
    });
    logStartupSuccess("outbox", "Embedded outbox worker started");
  } else {
    logStartupSkip("outbox", "Outbox worker disabled (OUTBOX_WORKER_ENABLED=false)");
  }
}

installFatalProcessHandlers(logger, { skip: env.NODE_ENV === "test" });

async function startWithRetry() {
  await withRetry(() => main(), {
    attempts: env.SERVER_START_RETRY_ATTEMPTS,
    baseDelayMs: env.SERVER_START_RETRY_BASE_DELAY_MS,
    maxDelayMs: env.SERVER_START_RETRY_MAX_DELAY_MS,
    event: "startup.retry",
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
  const formatted = formatError(err);
  if (err?.code === "EADDRINUSE") {
    logStartupFailure(
      "http",
      `Port ${env.PORT} already in use — stop the other process or change PORT in .env`,
      err,
      { port: env.PORT }
    );
  } else if (
    formatted.code === "ECONNREFUSED" ||
    err?.cause?.code === "ECONNREFUSED"
  ) {
    logStartupFailure(
      "database",
      "Cannot reach PostgreSQL — check DATABASE_URL and that the database is running",
      err,
      { dbHost: maskDatabaseHost(env.DATABASE_URL) }
    );
  } else {
    logStartupFailure("app", "Failed to start server", err);
  }
  process.exit(1);
});
