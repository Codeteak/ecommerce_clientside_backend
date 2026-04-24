// Purpose: Single shared ioredis client for REDIS_URL cache consumers (Redis/Valkey).
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
    const redisUrl = env.REDIS_URL;
    const redisHost = (() => {
      try {
        return new URL(redisUrl).hostname || "unknown";
      } catch {
        return "unknown";
      }
    })();
    const redisTls = String(redisUrl).startsWith("rediss://");

    client = new Redis(env.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      retryStrategy(times) {
        return Math.min(2000, 100 * times);
      }
    });
    client.on("connect", () => {
      logger.info({ event: "cache.connect", host: redisHost, tls: redisTls }, "Cache socket connected");
    });
    client.on("ready", () => {
      logger.info({ event: "cache.ready", host: redisHost, tls: redisTls }, "Cache client ready");
    });
    client.on("reconnecting", () => {
      logger.warn(
        { event: "cache.reconnecting", host: redisHost, tls: redisTls },
        "Cache reconnecting"
      );
    });
    client.on("error", (err) => {
      logger.warn(
        { event: "cache.error", host: redisHost, tls: redisTls, err },
        "Cache connection error"
      );
    });
  }
  return client;
}

/** Close the shared client (e.g. graceful shutdown). Safe to call multiple times. */
export async function disconnectSharedRedis() {
  if (!client) return;
  const c = client;
  client = null;
  try {
    await c.quit();
  } catch {
    try {
      c.disconnect();
    } catch {
      // ignore
    }
  }
}
