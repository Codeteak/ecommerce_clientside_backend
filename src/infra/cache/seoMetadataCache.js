import { createRedisJsonCache } from "./redisJsonCache.js";

/**
 * @param {{
 *   redis: import("ioredis").default | null,
 *   getPageMetadata: (shopId: string, pageType: "shop" | "product", slug?: string) => Promise<object>,
 *   ttlSec?: number
 * }} opts
 */
export function createSeoMetadataCache({ redis, getPageMetadata, ttlSec = 60 }) {
  const cache = createRedisJsonCache({ redis, layer: "seo", keyPrefix: "meta" });
  const ttl = Math.max(0, Number(ttlSec) || 0);

  return {
    async getPageMetadata(shopId, pageType, slug) {
      if (ttl <= 0) {
        return getPageMetadata(shopId, pageType, slug);
      }
      const id = String(shopId || "").trim();
      const key =
        pageType === "product"
          ? `${id}:product:${String(slug || "").trim().toLowerCase()}`
          : `${id}:shop`;
      return cache.wrap(key, ttl, () => getPageMetadata(shopId, pageType, slug));
    }
  };
}
