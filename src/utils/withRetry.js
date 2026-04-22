import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableByDefault(err) {
  const message = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "").toUpperCase();
  return (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN" ||
    code === "ENOTFOUND" ||
    message.includes("stream isn't writeable") ||
    message.includes("connection is closed") ||
    message.includes("socket closed") ||
    message.includes("timed out") ||
    message.includes("too many requests")
  );
}

/**
 * Retries transient failures with exponential backoff and jitter.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{
 *   attempts?: number,
 *   baseDelayMs?: number,
 *   maxDelayMs?: number,
 *   retryIf?: (err: unknown) => boolean,
 *   event?: string,
 *   context?: Record<string, unknown>
 * }} [opts]
 * @returns {Promise<T>}
 */
export async function withRetry(fn, opts = {}) {
  const attempts = Math.max(1, Number(opts.attempts ?? env.RETRY_ATTEMPTS ?? 3));
  const baseDelayMs = Math.max(1, Number(opts.baseDelayMs ?? env.RETRY_BASE_DELAY_MS ?? 120));
  const maxDelayMs = Math.max(baseDelayMs, Number(opts.maxDelayMs ?? env.RETRY_MAX_DELAY_MS ?? 1500));
  const retryIf = typeof opts.retryIf === "function" ? opts.retryIf : isRetryableByDefault;

  let lastErr;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const shouldRetry = i < attempts && retryIf(err);
      if (!shouldRetry) break;

      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (i - 1));
      const jitter = Math.floor(Math.random() * Math.max(1, Math.round(delay * 0.2)));
      const sleepMs = Math.min(maxDelayMs, delay + jitter);

      logger.warn(
        {
          event: opts.event || "retry.attempt",
          attempt: i,
          attempts,
          delayMs: sleepMs,
          err: err instanceof Error ? err.message : String(err),
          ...opts.context
        },
        "Retrying transient failure"
      );
      await wait(sleepMs);
    }
  }
  throw lastErr;
}
