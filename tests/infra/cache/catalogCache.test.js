import { describe, it, expect, vi } from "vitest";
import { createCatalogCache } from "../../../src/infra/cache/catalogCache.js";

describe("catalogCache", () => {
  it("invalidates via catalog generation INCR without SCAN", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue("2"),
      set: vi.fn().mockResolvedValue("OK"),
      incr: vi.fn().mockResolvedValue(3),
      del: vi.fn(),
      scan: vi.fn()
    };
    const cache = createCatalogCache({ redis });

    await cache.invalidateShopCatalog("00000000-0000-4000-8000-000000000001");

    expect(redis.incr).toHaveBeenCalledWith(
      "shop:00000000-0000-4000-8000-000000000001:catalogGen"
    );
    expect(redis.incr).toHaveBeenCalledWith(
      "shop:00000000-0000-4000-8000-000000000001:promoGen"
    );
    expect(redis.scan).not.toHaveBeenCalled();
  });

  it("invalidateShopPromotions only bumps promoGen", async () => {
    const redis = {
      get: vi.fn(),
      set: vi.fn(),
      incr: vi.fn().mockResolvedValue(2),
      del: vi.fn(),
      scan: vi.fn()
    };
    const cache = createCatalogCache({ redis });
    await cache.invalidateShopPromotions("00000000-0000-4000-8000-000000000001");
    expect(redis.incr).toHaveBeenCalledWith(
      "shop:00000000-0000-4000-8000-000000000001:promoGen"
    );
    expect(redis.incr).not.toHaveBeenCalledWith(
      "shop:00000000-0000-4000-8000-000000000001:catalogGen"
    );
  });

  it("shopKeyPrefix embeds current catalog generation", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue("4"),
      set: vi.fn(),
      incr: vi.fn(),
      del: vi.fn()
    };
    const cache = createCatalogCache({ redis });
    const prefix = await cache.shopKeyPrefix("00000000-0000-4000-8000-000000000001");

    expect(prefix).toBe("shop:00000000-0000-4000-8000-000000000001:g4:");
  });

  it("shopPromoKeyPrefix includes catalog and promo generations", async () => {
    const shopId = "00000000-0000-4000-8000-000000000001";
    const redis = {
      get: vi.fn(async (key) => {
        if (key === `shop:${shopId}:catalogGen`) return "4";
        if (key === `shop:${shopId}:promoGen`) return "2";
        return null;
      }),
      set: vi.fn(),
      incr: vi.fn(),
      del: vi.fn()
    };
    const cache = createCatalogCache({ redis });
    const prefix = await cache.shopPromoKeyPrefix(shopId);
    expect(prefix).toBe(`shop:${shopId}:g4:p2:`);
  });

  it("getStorefrontRevision combines catalog and promo generations", async () => {
    const shopId = "00000000-0000-4000-8000-000000000001";
    const redis = {
      get: vi.fn(async (key) => {
        if (key === `shop:${shopId}:catalogGen`) return "3";
        if (key === `shop:${shopId}:promoGen`) return "7";
        return null;
      }),
      set: vi.fn(),
      incr: vi.fn(),
      del: vi.fn()
    };
    const cache = createCatalogCache({ redis });
    const rev = await cache.getStorefrontRevision(shopId);
    expect(rev).toBe(3 * 1_000_000_000 + 7);
  });
});
