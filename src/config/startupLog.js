import { logger } from "./logger.js";
import { env } from "./env.js";
import { formatError } from "../utils/formatError.js";

/** @typedef {'database' | 'redis' | 'sentry' | 'app' | 'http' | 'realtime' | 'outbox' | 'shutdown'} StartupPhase */

/**
 * Redact credentials from DATABASE_URL for logs.
 * @param {string} raw
 */
export function maskDatabaseHost(raw) {
  try {
    const u = new URL(raw);
    const port = u.port || "5432";
    return `${u.hostname}:${port}${u.pathname || ""}`;
  } catch {
    return "(invalid DATABASE_URL)";
  }
}

export function logStartupBanner() {
  logger.info(
    {
      event: "startup.banner",
      service: "clientside-ecommerce-api",
      nodeEnv: env.NODE_ENV,
      port: env.CUSTOMER_PORT,
      apiPublicUrl: env.API_PUBLIC_URL || null
    },
    `Clientside API · ${env.NODE_ENV} · port ${env.CUSTOMER_PORT}`
  );
}

/**
 * @param {StartupPhase} phase
 * @param {string} message
 * @param {Record<string, unknown>} [extra]
 */
export function logStartupStep(phase, message, extra = {}) {
  logger.info({ event: `startup.${phase}.step`, phase, ...extra }, message);
}

/**
 * @param {StartupPhase} phase
 * @param {string} message
 * @param {Record<string, unknown>} [extra]
 */
export function logStartupSuccess(phase, message, extra = {}) {
  logger.info({ event: `startup.${phase}.ok`, phase, ...extra }, message);
}

/**
 * @param {StartupPhase} phase
 * @param {string} message
 * @param {Record<string, unknown>} [extra]
 */
export function logStartupSkip(phase, message, extra = {}) {
  logger.warn({ event: `startup.${phase}.skip`, phase, ...extra }, message);
}

/**
 * @param {StartupPhase} phase
 * @param {string} message
 * @param {unknown} [err]
 * @param {Record<string, unknown>} [extra]
 */
export function logStartupFailure(phase, message, err, extra = {}) {
  const formatted = formatError(err);
  logger.error(
    {
      event: `startup.${phase}.fail`,
      phase,
      errCode: formatted.code || undefined,
      errMessage: formatted.message,
      errName: formatted.name,
      ...extra
    },
    message
  );
}

/**
 * @param {Record<string, unknown>} summary
 * @param {string} message
 */
export function logStartupReady(summary, message) {
  logger.info({ event: "startup.ready", ...summary }, message);
}
