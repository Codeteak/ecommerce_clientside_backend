import { createHash } from "node:crypto";

/**
 * Shop-scoped promotion query cache (settings, bundles, overlays, coupon catalog).
 * Keys use catalogCache.shopKeyPrefix so catalog invalidate bumps generation.
 *
 * @param {{
 *   catalogCache: ReturnType<import("./catalogCache.js").createCatalogCache>,
 *   promotionRepo: import("../../application/ports/repositories/PromotionRepo.js").PromotionRepo,
 *   ttlSec?: number
 * }} opts
 */
export function createShopPromotionCache({ catalogCache, promotionRepo, ttlSec = 60 }) {
  const ttl = Math.max(0, Number(ttlSec) || 0);

  async function wrapShop(shopId, suffix, fn) {
    if (ttl <= 0 || typeof catalogCache.wrap !== "function") {
      return fn();
    }
    const prefix = await catalogCache.shopKeyPrefix(shopId);
    return catalogCache.wrap(`${prefix}promo:${suffix}`, ttl, fn);
  }

  function hashIds(ids) {
    const sorted = [...ids].map(String).sort();
    return createHash("sha256").update(sorted.join(",")).digest("hex").slice(0, 16);
  }

  return {
    ttlSec: ttl,

    getShopPromotionSettings(client, shopId) {
      return wrapShop(shopId, "settings", () =>
        promotionRepo.getShopPromotionSettings(client, shopId)
      );
    },

    listActiveBundleRulesForShop(client, shopId) {
      return wrapShop(shopId, "bundles", () =>
        promotionRepo.listActiveBundleRulesForShop(client, shopId)
      );
    },

    listActivePromotionProductOverlaysForShopProducts(client, shopId, shopProductIds) {
      const ids = Array.isArray(shopProductIds) ? shopProductIds.map(String).filter(Boolean) : [];
      if (!ids.length) return Promise.resolve([]);
      const suffix = `overlays:${hashIds(ids)}`;
      return wrapShop(shopId, suffix, () =>
        promotionRepo.listActivePromotionProductOverlaysForShopProducts(client, shopId, ids)
      );
    },

    listActiveBundleRulesForProduct(client, shopId, shopProductId, globalCategoryId) {
      const pid = String(shopProductId);
      const cat = globalCategoryId != null ? String(globalCategoryId) : "none";
      return wrapShop(shopId, `bundles:product:${pid}:${cat}`, () =>
        promotionRepo.listActiveBundleRulesForProduct(client, shopId, shopProductId, globalCategoryId)
      );
    },

    /**
     * Shop coupon definitions without redemption aggregates.
     * Merge live counts via promotionRepo.getCouponRedemptionCounts before eligibility checks.
     */
    listShopCouponCatalogRows(client, shopId, codeNormalized, options = {}) {
      const code = codeNormalized != null ? String(codeNormalized) : "all";
      const limit =
        options.limit != null && Number.isInteger(options.limit) ? String(options.limit) : "all";
      return wrapShop(shopId, `couponCatalog:v2:${code}:${limit}`, () =>
        promotionRepo.listEligibleCouponDefinitions(client, shopId, codeNormalized, options)
      );
    },

    /**
     * Cached enriched product detail promo payload.
     * @param {string} shopId
     * @param {string} productId
     * @param {() => Promise<object>} fn
     */
    wrapProductDetailPromo(shopId, productId, fn) {
      return wrapShop(shopId, `detail:${String(productId).toLowerCase()}`, fn);
    }
  };
}
