// Purpose: Single shared ioredis client for REDIS_URL cache consumers (Redis/Valkey).
import Redis from "ioredis";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

let client = null;
/** @type {Promise<import("ioredis").default | null> | null} */
let readyPromise = null;

const REDIS_READY_TIMEOUT_MS = 10_000;

/**
 * Wait until the shared client is connected (rate-limit script load, etc.).
 * @returns {Promise<import("ioredis").default | null>}
 */
export function ensureSharedRedisReady() {
  if (!env.REDIS_URL) return Promise.resolve(null);

  const redis = getSharedRedisClient();
  if (!redis) return Promise.resolve(null);
  if (redis.status === "ready") return Promise.resolve(redis);

  if (readyPromise) return readyPromise;

  readyPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      readyPromise = null;
      reject(new Error(`Redis not ready within ${REDIS_READY_TIMEOUT_MS}ms`));
    }, REDIS_READY_TIMEOUT_MS);

    const onReady = () => {
      cleanup();
      readyPromise = null;
      resolve(redis);
    };
    const onError = (err) => {
      cleanup();
      readyPromise = null;
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      redis.off("ready", onReady);
      redis.off("error", onError);
    };

    if (redis.status === "ready") {
      cleanup();
      readyPromise = null;
      resolve(redis);
      return;
    }

    redis.once("ready", onReady);
    redis.once("error", onError);
  });

  return readyPromise;
}

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
  readyPromise = null;
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
