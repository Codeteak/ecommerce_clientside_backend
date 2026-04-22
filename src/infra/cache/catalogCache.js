/**
 * Purpose: This file creates a small cache helper for catalog reads.
 * It uses Redis when available, and safely falls back to no-cache mode
 * so catalog endpoints still work if Redis is disabled or unavailable.
 *
 * @param {{ redis: import("ioredis").default | null }} opts
 */
import { incrementCacheMetric } from "../metrics/cacheMetrics.js";
import { logger } from "../../config/logger.js";
import { withRetry } from "../../utils/withRetry.js";

export function createCatalogCache({ redis }) {
  if (!redis) {
    return {
      async get(_key) {
        return null;
      },
      async set(_key, _value, _ttlSec) {},
      async wrap(_key, ttlSec, fn) {
        return fn();
      },
      async invalidateShopCatalog(_shopId) {}
    };
  }

  function getClient() {
    return redis;
  }

  return {
    async get(key) {
      try {
        const c = getClient();
        const raw = await withRetry(() => c.get(key), {
          event: "catalog_cache_get_retry",
          context: { cacheKey: key }
        });
        if (!raw) {
          incrementCacheMetric("get_miss");
          logger.debug({ event: "catalog_cache_miss", cacheKey: key }, "Catalog cache miss");
          return null;
        }
        incrementCacheMetric("get_hit");
        logger.debug({ event: "catalog_cache_hit", cacheKey: key }, "Catalog cache hit");
        return JSON.parse(raw);
      } catch (err) {
        incrementCacheMetric("get_error");
        logger.warn({ event: "catalog_cache_get_error", cacheKey: key, err }, "Catalog cache get failed");
        return null;
      }
    },

    async set(key, value, ttlSec) {
      try {
        const c = getClient();
        await withRetry(() => c.set(key, JSON.stringify(value), "EX", ttlSec), {
          event: "catalog_cache_set_retry",
          context: { cacheKey: key, ttlSec }
        });
        incrementCacheMetric("set_ok");
        logger.debug(
          { event: "catalog_cache_set_ok", cacheKey: key, ttlSec },
          "Catalog cache set success"
        );
      } catch (err) {
        incrementCacheMetric("set_error");
        logger.warn(
          { event: "catalog_cache_set_error", cacheKey: key, ttlSec, err },
          "Catalog cache set failed"
        );
      }
    },

    async wrap(key, ttlSec, fn) {
      const hit = await this.get(key);
      if (hit != null) return hit;
      const c = getClient();
      const lockKey = `lock:${key}`;
      const lock = await withRetry(() => c.set(lockKey, "1", "EX", 5, "NX"), {
        event: "catalog_cache_lock_retry",
        context: { cacheKey: key }
      }).catch(() => null);
      if (lock === "OK") {
        incrementCacheMetric("lock_acquired");
        logger.debug({ event: "catalog_cache_lock_acquired", cacheKey: key }, "Catalog cache lock acquired");
        try {
          incrementCacheMetric("wrap_recompute");
          const v = await fn();
          await this.set(key, v, ttlSec);
          return v;
        } finally {
          await c.del(lockKey).catch(() => {});
        }
      }

      incrementCacheMetric("lock_contended");
      logger.debug({ event: "catalog_cache_lock_contended", cacheKey: key }, "Catalog cache lock contended");
      for (let i = 0; i < 5; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        const retryHit = await this.get(key);
        if (retryHit != null) return retryHit;
      }

      incrementCacheMetric("wrap_recompute");
      const v = await fn();
      await this.set(key, v, ttlSec);
      return v;
    },

    /**
     * Deletes all Redis keys for a shop’s catalog cache (`shop:<uuid>:*`).
     * Use after admin catalog changes when Redis is enabled.
     */
    async invalidateShopCatalog(shopId) {
      const c = getClient();
      const pattern = `shop:${shopId}:*`;
      let cursor = "0";
      try {
        do {
          const res = await c.scan(cursor, "MATCH", pattern, "COUNT", 500);
          cursor = res[0];
          const keys = res[1];
          if (keys.length) {
            await c.del(...keys);
          }
        } while (cursor !== "0");
      } catch {
        // best-effort; callers should not fail storefront reads
      }
    }
  };
}
