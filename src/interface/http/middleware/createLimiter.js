// Purpose: Build express-rate-limit instances with shared options and the same 429 JSON body.

import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { env } from "../../../config/env.js";
import { getSharedRedisClient } from "../../../infra/redis/sharedRedis.js";
import { sendTooManyRequests } from "../responses/httpResponses.js";

/** @type {import("rate-limit-redis").RedisStore | null | undefined} */
let sharedRedisStore;

/**
 * @returns {import("express-rate-limit").Store | undefined}
 */
export function getRateLimitStore() {
  if (!env.REDIS_URL) return undefined;
  if (sharedRedisStore !== undefined) return sharedRedisStore ?? undefined;

  const redis = getSharedRedisClient();
  if (!redis) {
    sharedRedisStore = null;
    return undefined;
  }

  sharedRedisStore = new RedisStore({
    sendCommand: (...args) => redis.call(...args)
  });
  return sharedRedisStore;
}

/** Resets cached store (for tests). */
export function resetRateLimitStoreForTests() {
  sharedRedisStore = undefined;
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
 *   windowMs: number,
 *   maxTest: number,
 *   maxProd: number,
 *   message: string,
 *   keyGenerator?: import("express-rate-limit").Options["keyGenerator"]
 * }} opts
 */
export function createLimiter({ windowMs, maxTest, maxProd, message, keyGenerator }) {
  if (env.DISABLE_RATE_LIMITING) {
    return (_req, _res, next) => next();
  }

  const store = getRateLimitStore();

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
