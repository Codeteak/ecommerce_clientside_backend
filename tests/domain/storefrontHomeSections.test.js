import { describe, it, expect, vi } from "vitest";
import { createStorefrontCatalog } from "../../src/application/services/storefront/storefrontCatalog.js";
import { resolveStorefrontHomeSections } from "../../src/application/services/storefront/storefrontHomeSections.js";
import { storefrontCatalogTestDeps } from "../helpers/storefrontCatalogTestDeps.js";

const shopId = "00000000-0000-4000-8000-000000000001";
const PRODUCT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CATEGORY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OOS = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("resolveStorefrontHomeSections", () => {
  it("hydrates enabled shelves in sort order and drops unsellable products", async () => {
    const catalogRepo = {
      listEnabledHomeSectionsStorefront: vi.fn().mockResolvedValue([
        {
          id: "11111111-1111-4111-8111-111111111111",
          title: "Daily needs",
          type: "product_shelf",
          sort_order: 0,
          starts_at: null,
          ends_at: null,
          product_ids: [PRODUCT, OOS],
          category_ids: [CATEGORY],
          buy_product_ids: [],
          get_product_ids: [],
          buy_qty: null,
          get_qty: null,
          promotion_id: null
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          title: "Buy 1 Get 1",
          type: "buy_x_get_y",
          sort_order: 1,
          starts_at: null,
          ends_at: null,
          product_ids: [],
          category_ids: [],
          buy_product_ids: [PRODUCT],
          get_product_ids: [PRODUCT],
          buy_qty: 1,
          get_qty: 1,
          promotion_id: null
        }
      ]),
      listSellableProductsByIdsStorefront: vi.fn().mockResolvedValue([
        {
          id: PRODUCT,
          name: "Milk 1L",
          slug: "milk-1l",
          price_minor_per_unit: "4500",
          global_image_url: "https://cdn.example/milk.jpg",
          thumb_storage_key: null
        }
      ]),
      listActiveCategoriesByIdsStorefront: vi.fn().mockResolvedValue([
        { id: CATEGORY, name: "Dairy", slug: "dairy", image_storage_key: null }
      ])
    };

    const sections = await resolveStorefrontHomeSections(catalogRepo, shopId);
    expect(sections).toHaveLength(2);
    expect(sections[0].products).toHaveLength(1);
    expect(sections[0].products[0]).toMatchObject({
      id: PRODUCT,
      name: "Milk 1L",
      slug: "milk-1l",
      imageUrl: "https://cdn.example/milk.jpg",
      priceMinorPerUnit: 4500
    });
    expect(sections[0].categories[0].name).toBe("Dairy");
    expect(sections[1].label).toBe("Buy 1 Get 1 Free");
    expect(sections[1].buyProducts).toHaveLength(1);
  });
});

describe("storefrontCatalog listHomeSections", () => {
  it("wraps resolved shelves in data.sections", async () => {
    const catalogRepo = {
      listEnabledHomeSectionsStorefront: vi.fn().mockResolvedValue([]),
      listSellableProductsByIdsStorefront: vi.fn(),
      listActiveCategoriesByIdsStorefront: vi.fn()
    };
    const service = createStorefrontCatalog({
      catalogRepo,
      ensureShopForCatalog: vi.fn(),
      catalogCache: { swr: vi.fn(async (_k, _t, fn) => fn()) },
      ...storefrontCatalogTestDeps()
    });
    const out = await service.listHomeSections(shopId);
    expect(out).toEqual({ data: { sections: [] } });
    expect(catalogRepo.listEnabledHomeSectionsStorefront).toHaveBeenCalledWith(shopId);
  });
});
