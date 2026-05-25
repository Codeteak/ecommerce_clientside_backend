import { describe, expect, it, vi } from "vitest";
import { createPrewarmStorefrontCache } from "../../../src/application/services/cache/prewarmStorefrontCache.js";

const shopId = "00000000-0000-4000-8000-000000000001";

describe("prewarmStorefrontCache", () => {
  it("warms categories, default list, and top category lists", async () => {
    const storefrontCatalog = {
      listCategories: vi
        .fn()
        .mockResolvedValueOnce({ categories: [], shop_name: null, shop_image: null })
        .mockResolvedValueOnce({
          categories: [{ id: "cat-1" }, { id: "cat-2" }],
          shop_name: "Shop",
          shop_image: null
        }),
      listProducts: vi.fn().mockResolvedValue({ products: [] })
    };
    const prewarm = createPrewarmStorefrontCache({ storefrontCatalog });
    const result = await prewarm(shopId, { topCategoryLimit: 2 });

    expect(storefrontCatalog.listCategories).toHaveBeenCalledWith(shopId, { all: true });
    expect(storefrontCatalog.listCategories).toHaveBeenCalledWith(shopId, {});
    expect(storefrontCatalog.listProducts).toHaveBeenCalledWith(shopId, {
      limit: 50,
      sortBy: "created_at",
      sortOrder: "desc"
    });
    expect(storefrontCatalog.listProducts).toHaveBeenCalledWith(shopId, {
      limit: 50,
      sortBy: "created_at",
      sortOrder: "desc",
      categoryId: "cat-1"
    });
    expect(result.categoryIdsWarmed).toEqual(["cat-1", "cat-2"]);
    expect(result.failed).toBe(0);
  });

  it("continues when a category warm fails and reports failures", async () => {
    const storefrontCatalog = {
      listCategories: vi
        .fn()
        .mockResolvedValueOnce({ categories: [], shop_name: null, shop_image: null })
        .mockResolvedValueOnce({
          categories: [{ id: "bad" }, { id: "ok" }],
          shop_name: "Shop",
          shop_image: null
        }),
      listProducts: vi
        .fn()
        .mockResolvedValueOnce({ products: [] })
        .mockRejectedValueOnce(new Error("db down"))
        .mockResolvedValueOnce({ products: [] })
    };
    const prewarm = createPrewarmStorefrontCache({ storefrontCatalog });
    const result = await prewarm(shopId, { topCategoryLimit: 2 });

    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.steps.some((s) => s.ok === false)).toBe(true);
    expect(result.warmed).toBeGreaterThan(0);
  });
});
