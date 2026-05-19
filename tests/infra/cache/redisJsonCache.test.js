import { describe, it, expect, vi } from "vitest";
import { createRedisJsonCache } from "../../../src/infra/cache/redisJsonCache.js";

describe("redisJsonCache", () => {
  it("wrap recomputes on miss", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1)
    };
    const cache = createRedisJsonCache({ redis, layer: "meta", keyPrefix: "shop" });
    const fn = vi.fn().mockResolvedValue({ ok: true });

    const result = await cache.wrap("id:meta:active", 60, fn);

    expect(result).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalled();
  });

  it("no-ops when redis is null", async () => {
    const cache = createRedisJsonCache({ redis: null, layer: "resolve" });
    const fn = vi.fn().mockResolvedValue(42);
    expect(await cache.wrap("k", 60, fn)).toBe(42);
    expect(await cache.get("k")).toBeNull();
  });
});
