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
    expect(redis.scan).not.toHaveBeenCalled();
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
});
