import { describe, it, expect, vi } from "vitest";
import { createStorefrontCatalog } from "../../src/application/services/storefront/storefrontCatalog.js";
import { createStorefrontListingPromotions } from "../../src/application/services/storefront/storefrontListingPromotions.js";
import { storefrontCatalogTestDeps } from "../helpers/storefrontCatalogTestDeps.js";

const shopId = "00000000-0000-4000-8000-000000000001";

describe("storefrontCatalog category offers", () => {
  it("enriches categories with offer flags on each list call", async () => {
    const categoryId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const promotionRepo = {
      getShopPromotionSettings: vi.fn().mockResolvedValue({ promotions_paused: false }),
      listActiveCategoryPromotionSignals: vi.fn().mockResolvedValue({
        skuPromoCategoryIds: [categoryId],
        categoryDiscountRules: [
          {
            global_category_id: categoryId,
            promotion_id: "promo-cat",
            percent_bps: 1500,
            max_discount_minor: null,
            ends_at: "2026-12-31T00:00:00.000Z"
          }
        ]
      }),
      listActiveBundleRulesForShop: vi.fn().mockResolvedValue([
        {
          promotion_id: "promo-bundle",
          scope: "global_category",
          global_category_id: categoryId,
          shop_product_id: null,
          buy_qty: 2,
          get_qty: 1,
          reward_type: "free_units",
          reward_percent_bps: null,
          ends_at: "2026-12-31T00:00:00.000Z"
        }
      ])
    };
    const catalogRepo = {
      listCategoryIdsWithSellableProducts: vi.fn().mockResolvedValue([categoryId]),
      listCategoriesStorefront: vi.fn().mockResolvedValue([
        {
          id: categoryId,
          parent_id: null,
          name: "Dairy",
          slug: "dairy",
          sort_order: 0,
          image_storage_key: null
        }
      ])
    };
    const catalogCache = {
      swr: vi.fn(async (_key, _ttl, fn) => fn()),
      wrap: vi.fn(async (_key, _ttl, fn) => fn()),
      shopKeyPrefix: vi.fn().mockResolvedValue(`shop:${shopId}:g1:`)
    };
    const listingPromotions = createStorefrontListingPromotions({ promotionRepo });
    const shopLookupRepo = {
      findShopBrandingById: vi.fn().mockResolvedValue({
        id: shopId,
        name: "Market Fresh",
        shop_image_storage_key: null
      })
    };
    const service = createStorefrontCatalog({
      catalogRepo,
      ensureShopForCatalog: vi.fn(),
      catalogCache,
      catalogCacheTtlSec: 60,
      shopLookupRepo,
      ...storefrontCatalogTestDeps({ listingPromotions })
    });

    const out = await service.listCategories(shopId, { parentId: null });

    expect(promotionRepo.listActiveCategoryPromotionSignals).toHaveBeenCalled();
    expect(promotionRepo.listActiveBundleRulesForShop).toHaveBeenCalled();
    expect(out.shop_name).toBe("Market Fresh");
    expect(out.shop_image).toBeNull();
    expect(out.categories).toHaveLength(1);
    expect(out.categories[0].offers).toEqual({
      has_sku_promo: true,
      has_bundle: true,
      has_category_discount: true
    });
    expect(out.categories[0].bundle_rules).toHaveLength(1);
    expect(out.categories[0].category_discount_rules).toHaveLength(1);
  });
});
