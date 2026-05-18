/*
This worker continuously processes pending outbox messages in background.
*/

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { pool } from "../infra/db/pool.js";
import { createOutboxHandlers } from "../application/services/outboxHandlers.js";
import { getSharedRedisClient } from "../infra/redis/sharedRedis.js";
import { createOrderPlacedEmitter } from "../infra/realtime/createOrderPlacedEmitter.js";
import { processOutboxBatch } from "../application/services/outboxProcessor.js";
import { installFatalProcessHandlers } from "../utils/installFatalProcessHandlers.js";

function delay(ms, signal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
    }
  });
}

installFatalProcessHandlers(logger, { skip: env.NODE_ENV === "test" });

async function runOutboxWorker() {
  let orderPlacedEmitter = null;
  if (env.REALTIME_ENABLED) {
    const redis = getSharedRedisClient();
    if (redis) {
      orderPlacedEmitter = await createOrderPlacedEmitter({ redis, logger });
    } else {
      logger.warn(
        { event: "outbox.realtime.disabled_no_redis" },
        "REALTIME_ENABLED but Redis unavailable; ORDER_PLACED_REALTIME will no-op"
      );
    }
  }
  const handlers = createOutboxHandlers({
    emitOrderPlaced: orderPlacedEmitter?.emitOrderPlaced ?? (() => {})
  });
  const pollIntervalMs = env.OUTBOX_POLL_INTERVAL_MS;
  const batchSize = env.OUTBOX_BATCH_SIZE;
  const maxRetries = env.OUTBOX_MAX_RETRIES;
  const retryBaseMs = env.OUTBOX_RETRY_BASE_MS;
  const retryMaxMs = env.OUTBOX_RETRY_MAX_MS;
  const handlerTimeoutMs = env.OUTBOX_HANDLER_TIMEOUT_MS;
  const shutdownController = new AbortController();
  let stopping = false;

  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    logger.info({ event: "outbox.worker.stopping", signal }, "Outbox worker shutdown requested");
    shutdownController.abort();
  };

  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  logger.info(
    {
      event: "outbox.worker.started",
      batchSize,
      pollIntervalMs,
      maxRetries,
      retryBaseMs,
      retryMaxMs,
      handlerTimeoutMs
    },
    "Outbox worker started"
  );

  const shutdownDeadline =
    Date.now() + Math.max(0, Number(env.SHUTDOWN_TIMEOUT_MS) || 30_000);

  while (!stopping) {
    if (Date.now() >= shutdownDeadline) {
      logger.warn(
        { event: "outbox.worker.shutdown_timeout", timeoutMs: env.SHUTDOWN_TIMEOUT_MS },
        "Outbox worker shutdown timeout reached"
      );
      break;
    }
    try {
      const result = await processOutboxBatch({
        pool,
        handlers,
        logger,
        batchSize,
        maxRetries,
        retryBaseMs,
        retryMaxMs,
        handlerTimeoutMs
      });

      if (result.claimed > 0) {
        logger.info(
          {
            event: "outbox.worker.batch_processed",
            claimed: result.claimed,
            done: result.done,
            retried: result.retried,
            failed: result.failed
          },
          "Outbox batch processed"
        );
      }
    } catch (err) {
      logger.error({ event: "outbox.worker.batch_error", err }, "Outbox worker batch failed");
    }

    await delay(pollIntervalMs, shutdownController.signal);
  }

  await pool.end();
  logger.info({ event: "outbox.worker.stopped" }, "Outbox worker stopped");
}

runOutboxWorker().catch((err) => {
  logger.error({ event: "outbox.worker.fatal", err }, "Outbox worker fatal error");
  process.exit(1);
});
