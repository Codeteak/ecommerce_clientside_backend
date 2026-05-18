import { describe, it, expect, vi } from "vitest";
import { createStorefrontCatalog } from "../../src/application/services/storefront/storefrontCatalog.js";
import { storefrontCatalogTestDeps } from "../helpers/storefrontCatalogTestDeps.js";

const shopId = "00000000-0000-4000-8000-000000000001";

describe("storefrontCatalog categories", () => {
  it("loads sellable category ids once and passes them to listCategoriesStorefront", async () => {
    const sellableIds = ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"];
    const catalogRepo = {
      listCategoryIdsWithSellableProducts: vi.fn().mockResolvedValue(sellableIds),
      listCategoriesStorefront: vi.fn().mockResolvedValue([
        {
          id: sellableIds[0],
          parent_id: null,
          name: "Dairy",
          slug: "dairy",
          sort_order: 0,
          image_storage_key: null
        }
      ]),
      listAllCategoriesStorefront: vi.fn()
    };
    const catalogCache = {
      swr: vi.fn(async (_key, _ttl, fn) => fn()),
      wrap: vi.fn(async (_key, _ttl, fn) => fn()),
      shopKeyPrefix: vi.fn().mockResolvedValue(`shop:${shopId}:g1:`)
    };
    const service = createStorefrontCatalog({
      catalogRepo,
      ensureShopForCatalog: vi.fn(),
      catalogCache,
      catalogCacheTtlSec: 60,
      ...storefrontCatalogTestDeps()
    });

    const out = await service.listCategories(shopId, { parentId: null });
    expect(catalogRepo.listCategoryIdsWithSellableProducts).toHaveBeenCalledTimes(1);
    expect(catalogRepo.listCategoriesStorefront).toHaveBeenCalledWith(shopId, {
      parentId: null,
      sellableCategoryIds: sellableIds
    });
    expect(out).toHaveLength(1);
    expect(out[0].slug).toBe("dairy");
  });
});
