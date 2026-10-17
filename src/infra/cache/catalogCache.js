/**
 * Purpose: This file creates a small cache helper for catalog reads.
 * It uses Redis when available, and safely falls back to no-cache mode
 * so catalog endpoints still work if Redis is disabled or unavailable.
 *
 * Generations:
 * - catalogGen: product/category row payloads (bumped on catalog edits)
 * - promoGen: promotion overlays / listing promo / category offer signals
 *   (bumped on promotion edits without wiping product-list caches)
 *
 * @param {{ redis: import("ioredis").default | null }} opts
 */
import { incrementCacheMetric } from "../metrics/cacheMetrics.js";
import { logger } from "../../config/logger.js";
import { withRetry } from "../../utils/withRetry.js";

/** Contended callers wait up to this long for the lock holder to populate the key. */
const LOCK_WAIT_ATTEMPTS = 40;
const LOCK_WAIT_MS = 50;
/** Lock TTL must cover slow Postgres listing recomputes. */
const LOCK_TTL_SEC = 30;

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
      async swr(_key, ttlSec, fn) {
        return fn();
      },
      async invalidateShopCatalog(_shopId) {},
      async invalidateShopPromotions(_shopId) {},
      async getCatalogGeneration(_shopId) {
        return 0;
      },
      async getPromoGeneration(_shopId) {
        return 0;
      },
      async getStorefrontRevision(_shopId) {
        return 0;
      },
      async shopKeyPrefix(shopId) {
        return `shop:${String(shopId || "").trim()}:g0:`;
      },
      async shopPromoKeyPrefix(shopId) {
        return `shop:${String(shopId || "").trim()}:g0:p0:`;
      }
    };
  }

  function catalogGenKey(shopId) {
    const norm = String(shopId || "").trim();
    return norm ? `shop:${norm}:catalogGen` : "catalogGen:global";
  }

  function promoGenKey(shopId) {
    const norm = String(shopId || "").trim();
    return norm ? `shop:${norm}:promoGen` : "promoGen:global";
  }

  function getClient() {
    return redis;
  }

  function toEnvelope(data) {
    return { data, cachedAt: Date.now() };
  }

  function fromEnvelope(parsed) {
    if (parsed && typeof parsed === "object" && "data" in parsed && "cachedAt" in parsed) {
      return parsed;
    }
    return { data: parsed, cachedAt: Date.now() };
  }

  async function readGeneration(key) {
    try {
      const c = getClient();
      const raw = await c.get(key);
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  async function waitForKey(self, key) {
    for (let i = 0; i < LOCK_WAIT_ATTEMPTS; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_MS));
      const retryHit = await self.get(key);
      if (retryHit != null) return retryHit;
    }
    return null;
  }

  async function refreshInBackground({ c, key, lockKey, ttlSec, fn }) {
    const lock = await withRetry(() => c.set(lockKey, "1", "EX", LOCK_TTL_SEC, "NX"), {
      event: "catalog_cache_swr_lock_retry",
      context: { cacheKey: key }
    }).catch(() => null);
    if (lock !== "OK") return;
    void (async () => {
      try {
        const fresh = await fn();
        await withRetry(() => c.set(key, JSON.stringify(toEnvelope(fresh)), "EX", ttlSec * 2), {
          event: "catalog_cache_swr_set_retry",
          context: { cacheKey: key, ttlSec }
        });
      } catch (err) {
        logger.warn({ event: "catalog_cache_swr_refresh_error", cacheKey: key, err }, "Catalog SWR refresh failed");
      } finally {
        await c.del(lockKey).catch(() => {});
      }
    })();
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
      const lock = await withRetry(() => c.set(lockKey, "1", "EX", LOCK_TTL_SEC, "NX"), {
        event: "catalog_cache_lock_retry",
        context: { cacheKey: key }
      }).catch(() => null);
      if (lock === "OK") {
        incrementCacheMetric("lock_acquired");
        logger.debug({ event: "catalog_cache_lock_acquired", cacheKey: key }, "Catalog cache lock acquired");
        try {
          // Another waiter may have filled the key while we waited for the lock.
          const winnerHit = await this.get(key);
          if (winnerHit != null) return winnerHit;
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
      const waited = await waitForKey(this, key);
      if (waited != null) return waited;

      // Lock holder failed or timed out — recompute once.
      incrementCacheMetric("wrap_recompute");
      const v = await fn();
      await this.set(key, v, ttlSec);
      return v;
    },

    async swr(key, ttlSec, fn, { logLabel = "catalog", shopId = "unknown" } = {}) {
      const c = getClient();
      try {
        const raw = await withRetry(() => c.get(key), {
          event: "catalog_cache_swr_get_retry",
          context: { cacheKey: key }
        });
        if (raw) {
          const env = fromEnvelope(JSON.parse(raw));
          const ageSec = Math.floor((Date.now() - Number(env.cachedAt || 0)) / 1000);
          if (ageSec < ttlSec) {
            logger.debug({ event: "catalog_cache_swr_fresh", logLabel, shopId }, "Catalog SWR fresh hit");
            return env.data;
          }
          logger.debug({ event: "catalog_cache_swr_stale", logLabel, shopId }, "Catalog SWR stale hit");
          await refreshInBackground({
            c,
            key,
            lockKey: `lock:refresh:${key}`,
            ttlSec,
            fn
          });
          return env.data;
        }
      } catch (err) {
        logger.warn({ event: "catalog_cache_swr_read_error", cacheKey: key, err }, "Catalog SWR read failed");
      }

      // Cold miss: single-flight so concurrent home-shelf fetches don't each hit Postgres.
      const lockKey = `lock:swr:${key}`;
      const lock = await withRetry(() => c.set(lockKey, "1", "EX", LOCK_TTL_SEC, "NX"), {
        event: "catalog_cache_swr_cold_lock_retry",
        context: { cacheKey: key }
      }).catch(() => null);

      if (lock === "OK") {
        try {
          const raced = await withRetry(() => c.get(key), {
            event: "catalog_cache_swr_get_retry",
            context: { cacheKey: key }
          }).catch(() => null);
          if (raced) {
            return fromEnvelope(JSON.parse(raced)).data;
          }
          const fresh = await fn();
          await this.set(key, toEnvelope(fresh), ttlSec * 2);
          return fresh;
        } finally {
          await c.del(lockKey).catch(() => {});
        }
      }

      logger.debug(
        { event: "catalog_cache_swr_cold_contended", cacheKey: key, logLabel, shopId },
        "Catalog SWR cold miss contended"
      );
      for (let i = 0; i < LOCK_WAIT_ATTEMPTS; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_MS));
        try {
          const raw = await c.get(key);
          if (raw) return fromEnvelope(JSON.parse(raw)).data;
        } catch {
          /* ignore and keep waiting */
        }
      }

      const fresh = await fn();
      await this.set(key, toEnvelope(fresh), ttlSec * 2);
      return fresh;
    },

    async getCatalogGeneration(shopId) {
      return readGeneration(catalogGenKey(shopId));
    },

    async getPromoGeneration(shopId) {
      return readGeneration(promoGenKey(shopId));
    },

    /**
     * Monotonic revision for FE pollers — changes when catalog OR promotions invalidate.
     */
    async getStorefrontRevision(shopId) {
      const [catalog, promo] = await Promise.all([
        this.getCatalogGeneration(shopId),
        this.getPromoGeneration(shopId)
      ]);
      return catalog * 1_000_000_000 + promo;
    },

    /** Product/category row cache prefix (catalogGen only). */
    async shopKeyPrefix(shopId) {
      const gen = await this.getCatalogGeneration(shopId);
      const normShopId = String(shopId || "").trim();
      return normShopId ? `shop:${normShopId}:g${gen}:` : `shop:global:g${gen}:`;
    },

    /**
     * Promotion-aware prefix. Includes catalogGen so a full catalog invalidate
     * also drops promo keys; promoGen bumps alone leave product-list keys warm.
     */
    async shopPromoKeyPrefix(shopId) {
      const [catalogGen, promoGen] = await Promise.all([
        this.getCatalogGeneration(shopId),
        this.getPromoGeneration(shopId)
      ]);
      const normShopId = String(shopId || "").trim();
      return normShopId
        ? `shop:${normShopId}:g${catalogGen}:p${promoGen}:`
        : `shop:global:g${catalogGen}:p${promoGen}:`;
    },

    /**
     * Bumps catalog generation so versioned product/category keys miss without SCAN.
     * Also bumps promoGen so promotion keys under shopPromoKeyPrefix miss.
     */
    async invalidateShopCatalog(shopId) {
      const c = getClient();
      try {
        await Promise.all([c.incr(catalogGenKey(shopId)), c.incr(promoGenKey(shopId))]);
      } catch {
        // best-effort; callers should not fail storefront reads
      }
    },

    /**
     * Promotion-only invalidate: product list row caches stay warm.
     */
    async invalidateShopPromotions(shopId) {
      const c = getClient();
      try {
        await c.incr(promoGenKey(shopId));
      } catch {
        // best-effort
      }
    }
  };
}
