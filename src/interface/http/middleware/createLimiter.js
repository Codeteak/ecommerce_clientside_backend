// Purpose: Build express-rate-limit instances with shared options and the same 429 JSON body.

import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { env } from "../../../config/env.js";
import { getSharedRedisClient } from "../../../infra/redis/sharedRedis.js";
import { sendTooManyRequests } from "../responses/httpResponses.js";

/**
 * @param {import("express-rate-limit").Options["keyGenerator"]} customKeyGenerator
 */
function withKeyGenerator(customKeyGenerator) {
  if (!customKeyGenerator) return undefined;
  return (req, res) => customKeyGenerator(req, res);
}

function buildStoreIfConfigured() {
  const redisClient = getSharedRedisClient();
  if (!redisClient) return undefined;
  return new RedisStore({
    sendCommand: (...args) => redisClient.call(...args)
  });
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
  return rateLimit({
    windowMs,
    max: env.NODE_ENV === "test" ? maxTest : maxProd,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildStoreIfConfigured(),
    keyGenerator: withKeyGenerator(keyGenerator),
    handler: (_req, res) => sendTooManyRequests(res, message)
  });
}
