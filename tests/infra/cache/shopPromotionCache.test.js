import { describe, it, expect, vi } from "vitest";
import { createShopPromotionCache } from "../../../src/infra/cache/shopPromotionCache.js";

describe("shopPromotionCache", () => {
  it("wraps promotion settings with versioned catalog prefix", async () => {
    const promotionRepo = {
      getShopPromotionSettings: vi.fn().mockResolvedValue({ promotions_paused: false })
    };
    const catalogCache = {
      shopKeyPrefix: vi.fn().mockResolvedValue("shop:abc:g2:"),
      wrap: vi.fn(async (_key, _ttl, fn) => fn())
    };
    const cache = createShopPromotionCache({
      catalogCache,
      promotionRepo,
      ttlSec: 60
    });

    const client = {};
    const out = await cache.getShopPromotionSettings(client, "abc");

    expect(out).toEqual({ promotions_paused: false });
    expect(catalogCache.wrap).toHaveBeenCalledWith(
      "shop:abc:g2:promo:settings",
      60,
      expect.any(Function)
    );
    expect(promotionRepo.getShopPromotionSettings).toHaveBeenCalledWith(client, "abc");
  });

  it("caches coupon definitions without usage join", async () => {
    const promotionRepo = {
      listEligibleCouponDefinitions: vi.fn().mockResolvedValue([{ id: "c1" }])
    };
    const catalogCache = {
      shopKeyPrefix: vi.fn().mockResolvedValue("shop:abc:g2:"),
      wrap: vi.fn(async (_key, _ttl, fn) => fn())
    };
    const cache = createShopPromotionCache({
      catalogCache,
      promotionRepo,
      ttlSec: 60
    });

    const rows = await cache.listShopCouponCatalogRows({}, "abc", null, { limit: 10 });
    expect(rows).toEqual([{ id: "c1" }]);
    expect(catalogCache.wrap).toHaveBeenCalledWith(
      "shop:abc:g2:promo:couponCatalog:v2:all:10",
      60,
      expect.any(Function)
    );
    expect(promotionRepo.listEligibleCouponDefinitions).toHaveBeenCalled();
  });

  it("skips wrap when ttl is zero", async () => {
    const promotionRepo = {
      listActiveBundleRulesForShop: vi.fn().mockResolvedValue([{ id: "b1" }])
    };
    const catalogCache = {
      shopKeyPrefix: vi.fn(),
      wrap: vi.fn()
    };
    const cache = createShopPromotionCache({
      catalogCache,
      promotionRepo,
      ttlSec: 0
    });

    const rows = await cache.listActiveBundleRulesForShop({}, "shop-1");
    expect(rows).toEqual([{ id: "b1" }]);
    expect(catalogCache.wrap).not.toHaveBeenCalled();
  });
});
