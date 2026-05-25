/**
 * Background outbox poll loop. Runs in the API process by default; optional standalone via outbox.worker.js.
 */

import { env } from "../../config/env.js";
import { createOutboxHandlers } from "../../application/services/outboxHandlers.js";
import { processOutboxBatch } from "../../application/services/outboxProcessor.js";
import { createOrderPlacedEmitter } from "../realtime/createOrderPlacedEmitter.js";
import { getSharedRedisClient } from "../redis/sharedRedis.js";

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

/**
 * @param {{
 *   pool: import("pg").Pool,
 *   logger: import("pino").Logger,
 *   emitOrderPlaced?: (payload: unknown) => void,
 *   embedded?: boolean
 * }} opts
 * @returns {{ stop: () => void, stopped: Promise<void> }}
 */
export function startOutboxPoller({ pool, logger, emitOrderPlaced: emitOrderPlacedIn, embedded = false }) {
  const abortController = new AbortController();
  const { signal } = abortController;

  const stopped = (async () => {
    let emitOrderPlaced = emitOrderPlacedIn ?? (() => {});
    let closeEmitter = async () => {};

    if (!emitOrderPlacedIn && env.REALTIME_ENABLED) {
      const redis = getSharedRedisClient();
      if (redis) {
        const emitter = await createOrderPlacedEmitter({ redis, logger });
        emitOrderPlaced = emitter.emitOrderPlaced;
        closeEmitter = emitter.close;
      } else {
        logger.warn(
          { event: "outbox.realtime.disabled_no_redis" },
          "REALTIME_ENABLED but Redis unavailable; ORDER_PLACED_REALTIME will no-op"
        );
      }
    }

    const handlers = createOutboxHandlers({ emitOrderPlaced });
    const pollIntervalMs = env.OUTBOX_POLL_INTERVAL_MS;
    const batchSize = env.OUTBOX_BATCH_SIZE;
    const maxRetries = env.OUTBOX_MAX_RETRIES;
    const retryBaseMs = env.OUTBOX_RETRY_BASE_MS;
    const retryMaxMs = env.OUTBOX_RETRY_MAX_MS;
    const handlerTimeoutMs = env.OUTBOX_HANDLER_TIMEOUT_MS;

    logger.info(
      {
        event: "outbox.worker.started",
        embedded,
        batchSize,
        pollIntervalMs,
        maxRetries,
        retryBaseMs,
        retryMaxMs,
        handlerTimeoutMs
      },
      embedded ? "Outbox poller started (embedded in API)" : "Outbox worker started"
    );

    while (!signal.aborted) {
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

      await delay(pollIntervalMs, signal);
    }

    await closeEmitter();
    logger.info({ event: "outbox.worker.stopped", embedded }, "Outbox poller stopped");
  })();

  return {
    stop() {
      abortController.abort();
    },
    stopped
  };
}
