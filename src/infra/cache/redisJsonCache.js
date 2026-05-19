/**
 * Low-level Redis get/set/wrap with JSON values and per-layer metrics.
 *
 * @param {{ redis: import("ioredis").default | null, layer: string, keyPrefix?: string }} opts
 */
import { incrementCacheMetric } from "../metrics/cacheMetrics.js";
import { logger } from "../../config/logger.js";
import { withRetry } from "../../utils/withRetry.js";

export function createRedisJsonCache({ redis, layer, keyPrefix = "" }) {
  const prefix = keyPrefix ? `${keyPrefix}:` : "";

  function fullKey(key) {
    return `${prefix}${key}`;
  }

  if (!redis) {
    return {
      async get(_key) {
        return null;
      },
      async set(_key, _value, _ttlSec) {},
      async wrap(_key, _ttlSec, fn) {
        return fn();
      },
      async del(_key) {}
    };
  }

  return {
    async get(key) {
      const k = fullKey(key);
      try {
        const raw = await withRetry(() => redis.get(k), {
          event: `${layer}_cache_get_retry`,
          context: { cacheKey: k }
        });
        if (!raw) {
          incrementCacheMetric("get_miss", layer);
          return null;
        }
        incrementCacheMetric("get_hit", layer);
        return JSON.parse(raw);
      } catch (err) {
        incrementCacheMetric("get_error", layer);
        logger.warn({ event: `${layer}_cache_get_error`, cacheKey: k, err }, "Cache get failed");
        return null;
      }
    },

    async set(key, value, ttlSec) {
      const k = fullKey(key);
      try {
        await withRetry(() => redis.set(k, JSON.stringify(value), "EX", Math.max(1, ttlSec)), {
          event: `${layer}_cache_set_retry`,
          context: { cacheKey: k, ttlSec }
        });
        incrementCacheMetric("set_ok", layer);
      } catch (err) {
        incrementCacheMetric("set_error", layer);
        logger.warn({ event: `${layer}_cache_set_error`, cacheKey: k, ttlSec, err }, "Cache set failed");
      }
    },

    async wrap(key, ttlSec, fn) {
      const hit = await this.get(key);
      if (hit != null) return hit;

      const k = fullKey(key);
      const lockKey = `lock:${k}`;
      const lock = await withRetry(() => redis.set(lockKey, "1", "EX", 5, "NX"), {
        event: `${layer}_cache_lock_retry`,
        context: { cacheKey: k }
      }).catch(() => null);

      if (lock === "OK") {
        incrementCacheMetric("lock_acquired", layer);
        try {
          incrementCacheMetric("wrap_recompute", layer);
          const v = await fn();
          await this.set(key, v, ttlSec);
          return v;
        } finally {
          await redis.del(lockKey).catch(() => {});
        }
      }

      incrementCacheMetric("lock_contended", layer);
      for (let i = 0; i < 5; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        const retryHit = await this.get(key);
        if (retryHit != null) return retryHit;
      }

      incrementCacheMetric("wrap_recompute", layer);
      const v = await fn();
      await this.set(key, v, ttlSec);
      return v;
    },

    async del(key) {
      const k = fullKey(key);
      try {
        await redis.del(k);
      } catch {
        // best-effort
      }
    }
  };
}
