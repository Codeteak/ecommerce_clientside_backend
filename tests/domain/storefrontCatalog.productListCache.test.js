import { describe, expect, it, vi } from "vitest";
import { createStorefrontCatalog } from "../../src/application/services/storefront/storefrontCatalog.js";
import { storefrontCatalogTestDeps } from "../helpers/storefrontCatalogTestDeps.js";

const shopId = "00000000-0000-4000-8000-000000000001";

function makeCatalogService(catalogCache, productListCachePolicy = {}) {
  return createStorefrontCatalog({
    catalogRepo: {
      listProductsStorefront: vi.fn().mockResolvedValue([])
    },
    ensureShopForCatalog: vi.fn(),
    catalogCache,
    catalogCacheTtlSec: 60,
    productListCachePolicy: {
      maxLimit: 50,
      maxOffset: 100,
      searchMinChars: 3,
      ...productListCachePolicy
    },
    ...storefrontCatalogTestDeps()
  });
}

describe("storefrontCatalog product list cache policy", () => {
  it("uses SWR for default product list", async () => {
    const swr = vi.fn(async (_key, _ttl, fn) => fn());
    const service = makeCatalogService({
      swr,
      wrap: vi.fn(async (_key, _ttl, fn) => fn()),
      shopKeyPrefix: vi.fn().mockResolvedValue(`shop:${shopId}:g1:`)
    });

    await service.listProducts(shopId, { limit: 24 });
    expect(swr).toHaveBeenCalled();
  });

  it("skips SWR for short search", async () => {
    const swr = vi.fn(async (_key, _ttl, fn) => fn());
    const service = makeCatalogService({
      swr,
      wrap: vi.fn(async (_key, _ttl, fn) => fn()),
      shopKeyPrefix: vi.fn().mockResolvedValue(`shop:${shopId}:g1:`)
    });

    await service.listProducts(shopId, { search: "ab", limit: 24 });
    expect(swr).not.toHaveBeenCalled();
  });

  it("skips SWR when limit exceeds policy max", async () => {
    const swr = vi.fn(async (_key, _ttl, fn) => fn());
    const service = makeCatalogService({
      swr,
      wrap: vi.fn(async (_key, _ttl, fn) => fn()),
      shopKeyPrefix: vi.fn().mockResolvedValue(`shop:${shopId}:g1:`)
    });

    await service.listProducts(shopId, { limit: 60 });
    expect(swr).not.toHaveBeenCalled();
  });

  it("skips SWR for high offset", async () => {
    const swr = vi.fn(async (_key, _ttl, fn) => fn());
    const service = makeCatalogService({
      swr,
      wrap: vi.fn(async (_key, _ttl, fn) => fn()),
      shopKeyPrefix: vi.fn().mockResolvedValue(`shop:${shopId}:g1:`)
    });

    await service.listProducts(shopId, { limit: 24, offset: 120 });
    expect(swr).not.toHaveBeenCalled();
  });
});
