// Purpose: Single shared ioredis client for REDIS_URL consumers (rate limits, catalog cache).
import Redis from "ioredis";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

let client = null;

/**
 * @returns {import("ioredis").default | null}
 */
export function getSharedRedisClient() {
  if (!env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false
    });
    client.on("error", (err) => {
      logger.warn({ err }, "Redis connection error");
    });
  }
  return client;
}
