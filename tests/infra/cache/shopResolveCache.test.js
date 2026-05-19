import { describe, it, expect, vi, beforeEach } from "vitest";
import { createShopResolveCache } from "../../../src/infra/cache/shopResolveCache.js";

describe("shopResolveCache", () => {
  /** @type {Record<string, string>} */
  let store;

  beforeEach(() => {
    store = {};
  });

  function mockRedis() {
    return {
      get: vi.fn(async (key) => store[key] ?? null),
      set: vi.fn(async (key, value, ...args) => {
        void args;
        store[key] = value;
        return "OK";
      }),
      del: vi.fn(async (key) => {
        delete store[key];
        return 1;
      }),
      call: vi.fn()
    };
  }

  it("caches slug to shopId resolution", async () => {
    const shopLookupRepo = {
      findShopIdBySlug: vi.fn().mockResolvedValue("shop-uuid-1"),
      findShopIdByCustomDomain: vi.fn(),
      findShopIdByDomain: vi.fn()
    };
    const cache = createShopResolveCache({
      redis: mockRedis(),
      shopLookupRepo,
      getShopById: vi.fn(),
      resolveTtlSec: 300
    });

    const a = await cache.findShopIdBySlug("my-store");
    const b = await cache.findShopIdBySlug("my-store");

    expect(a).toBe("shop-uuid-1");
    expect(b).toBe("shop-uuid-1");
    expect(shopLookupRepo.findShopIdBySlug).toHaveBeenCalledTimes(1);
  });

  it("invalidateShop clears meta keys", async () => {
    const redis = mockRedis();
    const shopLookupRepo = {
      findShopIdBySlug: vi.fn(),
      findShopIdByCustomDomain: vi.fn(),
      findShopIdByDomain: vi.fn()
    };
    const getShopById = vi.fn().mockResolvedValue({ id: "s1", is_active: true });
    const cache = createShopResolveCache({
      redis,
      shopLookupRepo,
      getShopById,
      metaTtlSec: 300
    });

    await cache.ensureShopAllowsCustomers("s1");
    await cache.invalidateShop("s1");
    await cache.ensureShopAllowsCustomers("s1");

    expect(getShopById).toHaveBeenCalledTimes(2);
  });
});
