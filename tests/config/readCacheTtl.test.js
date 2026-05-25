import { describe, it, expect } from "vitest";
import {
  buildReadCacheStartupStatus,
  effectiveReadCacheTtlSec,
  formatReadCacheStartupSummary
} from "../../src/config/env/readCacheTtl.js";

describe("effectiveReadCacheTtlSec", () => {
  it("returns configured TTL when CACHE_ON is true", () => {
    expect(effectiveReadCacheTtlSec(300, true)).toBe(300);
    expect(effectiveReadCacheTtlSec(60, true)).toBe(60);
  });

  it("returns 0 when CACHE_ON is false regardless of configured TTL", () => {
    expect(effectiveReadCacheTtlSec(300, false)).toBe(0);
    expect(effectiveReadCacheTtlSec(60, false)).toBe(0);
  });

  it("treats invalid TTL as 0 when cache is on", () => {
    expect(effectiveReadCacheTtlSec(undefined, true)).toBe(0);
    expect(effectiveReadCacheTtlSec("bad", true)).toBe(0);
  });
});

describe("buildReadCacheStartupStatus", () => {
  it("reports read caches on with effective TTLs", () => {
    const status = buildReadCacheStartupStatus({
      CACHE_ON: true,
      REDIS_URL: "redis://127.0.0.1:6379",
      STOREFRONT_CATALOG_CACHE_TTL_SEC: 60,
      STOREFRONT_PROMO_CACHE_TTL_SEC: 0,
      SHOP_RESOLVE_CACHE_TTL_SEC: 300,
      SHOP_SERVICE_AREA_CACHE_TTL_SEC: 180,
      STOREFRONT_CATALOG_HTTP_CACHE_SEC: 0
    });
    expect(status.readCachesActive).toBe(true);
    expect(status.effectiveTtlSec.catalog).toBe(60);
    expect(status.effectiveTtlSec.shopResolve).toBe(300);
    expect(status.summary).toContain("read caches on");
    expect(status.summary).toContain("resolve-by-domain=300s");
  });

  it("reports read caches off when CACHE_ON is false", () => {
    const status = buildReadCacheStartupStatus({
      CACHE_ON: false,
      REDIS_URL: "redis://127.0.0.1:6379",
      STOREFRONT_CATALOG_CACHE_TTL_SEC: 60,
      STOREFRONT_PROMO_CACHE_TTL_SEC: 0,
      SHOP_RESOLVE_CACHE_TTL_SEC: 300,
      SHOP_SERVICE_AREA_CACHE_TTL_SEC: 180,
      STOREFRONT_CATALOG_HTTP_CACHE_SEC: 0
    });
    expect(status.readCachesActive).toBe(false);
    expect(status.effectiveTtlSec.catalog).toBe(0);
    expect(formatReadCacheStartupSummary(status)).toContain("CACHE_ON=false");
  });
});
