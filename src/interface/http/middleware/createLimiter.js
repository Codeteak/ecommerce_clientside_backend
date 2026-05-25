// Purpose: Build express-rate-limit instances with shared options and the same 429 JSON body.

import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { env } from "../../../config/env.js";
import { logger } from "../../../config/logger.js";
import { ensureSharedRedisReady, getSharedRedisClient } from "../../../infra/redis/sharedRedis.js";
import { sendTooManyRequests } from "../responses/httpResponses.js";

/** @type {Map<string, import("rate-limit-redis").RedisStore>} */
const storesById = new Map();
let rateLimitRedisReady = false;

/**
 * Call before creating Express routes when REDIS_URL is set.
 * Avoids RedisStore script load while the socket is still connecting.
 */
export async function warmupRateLimitRedis() {
  if (!env.REDIS_URL || env.DISABLE_RATE_LIMITING) {
    rateLimitRedisReady = false;
    return;
  }
  try {
    await ensureSharedRedisReady();
    rateLimitRedisReady = true;
  } catch (err) {
    rateLimitRedisReady = false;
    logger.warn(
      { err, event: "rate_limit.redis_warmup_failed" },
      "Redis not ready for rate limits; using in-memory limiter per process"
    );
  }
}

/**
 * One RedisStore per limiter id (express-rate-limit forbids sharing a store).
 *
 * @param {string} storeId
 * @returns {import("express-rate-limit").Store | undefined}
 */
export function getRateLimitStore(storeId) {
  if (!env.REDIS_URL || env.DISABLE_RATE_LIMITING || !rateLimitRedisReady) {
    return undefined;
  }
  const id = String(storeId || "").trim();
  if (!id) return undefined;

  const cached = storesById.get(id);
  if (cached) return cached;

  const redis = getSharedRedisClient();
  if (!redis || redis.status !== "ready") {
    return undefined;
  }

  try {
    const store = new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: `rl:${id}:`
    });
    storesById.set(id, store);
    return store;
  } catch (err) {
    logger.warn(
      { err, event: "rate_limit.store_create_failed", storeId: id },
      "Failed to create Redis rate limit store"
    );
    return undefined;
  }
}

/** Resets cached stores (for tests). */
export function resetRateLimitStoreForTests() {
  storesById.clear();
  rateLimitRedisReady = false;
}

/**
 * @param {import("express-rate-limit").Options["keyGenerator"]} customKeyGenerator
 */
function withKeyGenerator(customKeyGenerator) {
  if (!customKeyGenerator) return undefined;
  return (req, res) => customKeyGenerator(req, res);
}

/**
 * @param {{
 *   storeId: string,
 *   windowMs: number,
 *   maxTest: number,
 *   maxProd: number,
 *   message: string,
 *   keyGenerator?: import("express-rate-limit").Options["keyGenerator"]
 * }} opts
 */
export function createLimiter({ storeId, windowMs, maxTest, maxProd, message, keyGenerator }) {
  if (env.DISABLE_RATE_LIMITING) {
    return (_req, _res, next) => next();
  }

  const store = getRateLimitStore(storeId);

  return rateLimit({
    windowMs,
    max: env.NODE_ENV === "test" ? maxTest : maxProd,
    standardHeaders: true,
    legacyHeaders: false,
    ...(store ? { store } : {}),
    keyGenerator: withKeyGenerator(keyGenerator),
    handler: (_req, res) => sendTooManyRequests(res, message)
  });
}
