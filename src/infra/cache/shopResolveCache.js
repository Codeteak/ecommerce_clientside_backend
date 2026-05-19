import { createRedisJsonCache } from "./redisJsonCache.js";

const NULL_MARKER = "__null__";

/**
 * Domain/slug → shopId, shop metadata, and service-area hub rows.
 *
 * @param {{
 *   redis: import("ioredis").default | null,
 *   shopLookupRepo: import("../../adapters/repositories/postgres/ShopLookupRepoPg.js").ShopLookupRepoPg,
 *   getShopById: (shopId: string) => Promise<object | null>,
 *   resolveTtlSec?: number,
 *   metaTtlSec?: number,
 *   serviceHubTtlSec?: number
 * }} opts
 */
export function createShopResolveCache({
  redis,
  shopLookupRepo,
  getShopById,
  resolveTtlSec = 300,
  metaTtlSec = 300,
  serviceHubTtlSec = 180
}) {
  const resolveCache = createRedisJsonCache({ redis, layer: "resolve", keyPrefix: "resolve" });
  const metaCache = createRedisJsonCache({ redis, layer: "meta", keyPrefix: "shop" });

  const resolveTtl = Math.max(0, Number(resolveTtlSec) || 0);
  const metaTtl = Math.max(0, Number(metaTtlSec) || 0);
  const hubTtl = Math.max(0, Number(serviceHubTtlSec) || 0);

  async function cachedResolve(key, ttl, fn) {
    if (ttl <= 0) return fn();
    const hit = await resolveCache.get(key);
    if (hit === NULL_MARKER) return null;
    if (hit != null) return hit;
    const value = await fn();
    await resolveCache.set(key, value ?? NULL_MARKER, ttl);
    return value;
  }

  return {
    findShopIdBySlug(slug) {
      const s = String(slug || "").trim().toLowerCase();
      if (!s) return Promise.resolve(null);
      return cachedResolve(`slug:${s}`, resolveTtl, () => shopLookupRepo.findShopIdBySlug(s));
    },

    findShopIdByCustomDomain(host) {
      const h = String(host || "").trim().toLowerCase();
      if (!h) return Promise.resolve(null);
      return cachedResolve(`host:${h}`, resolveTtl, () => shopLookupRepo.findShopIdByCustomDomain(h));
    },

    findShopIdByDomain(domain) {
      const d = String(domain || "").trim().toLowerCase();
      if (!d) return Promise.resolve(null);
      return cachedResolve(`domain:${d}`, resolveTtl, () => shopLookupRepo.findShopIdByDomain(d));
    },

    async ensureShopAllowsCustomers(shopId) {
      if (metaTtl <= 0) {
        return getShopById(shopId);
      }

      const key = `${String(shopId).trim()}:meta:active`;
      const hit = await metaCache.get(key);
      if (hit != null) return hit;

      const shop = await getShopById(shopId);
      if (shop) {
        await metaCache.set(key, shop, metaTtl);
      }
      return shop;
    },

    getShopServiceHub(shopId, shopServiceAreaRepo) {
      const id = String(shopId || "").trim();
      if (!id) return Promise.resolve(null);
      if (hubTtl <= 0) {
        return shopServiceAreaRepo.getShopHubForServiceCheck(id);
      }
      const key = `${id}:serviceHub`;
      return metaCache.wrap(key, hubTtl, () => shopServiceAreaRepo.getShopHubForServiceCheck(id));
    },

    async invalidateShop(shopId) {
      const id = String(shopId || "").trim();
      if (!id) return;
      await metaCache.del(`${id}:meta:active`);
      await metaCache.del(`${id}:serviceHub`);
    }
  };
}
