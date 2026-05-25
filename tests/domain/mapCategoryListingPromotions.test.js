import { describe, it, expect } from "vitest";
import {
  filterBundleRuleRowsForCategory,
  withCategoryListingOffers
} from "../../src/application/services/promotions/mapCategoryListingPromotions.js";

describe("mapCategoryListingPromotions", () => {
  const category = {
    id: "c1",
    name: "Dairy",
    slug: "dairy",
    parent_id: null,
    sort_order: 0,
    image: null
  };

  it("filterBundleRuleRowsForCategory keeps global_category scope only", () => {
    const rows = [
      { scope: "same_shop_product", shop_product_id: "p1", global_category_id: null },
      { scope: "global_category", global_category_id: "c1", promotion_id: "promo-1" },
      { scope: "global_category", global_category_id: "c2", promotion_id: "promo-2" }
    ];
    expect(filterBundleRuleRowsForCategory(rows, "c1")).toHaveLength(1);
    expect(filterBundleRuleRowsForCategory(rows, "c1")[0].promotion_id).toBe("promo-1");
  });

  it("withCategoryListingOffers sets flags from live promotion signals", () => {
    const bundleRowsRaw = [
      {
        promotion_id: "b1",
        scope: "global_category",
        global_category_id: "c1",
        buy_qty: 2,
        get_qty: 1,
        reward_type: "free_units",
        reward_percent_bps: null,
        ends_at: "2026-12-31T00:00:00.000Z"
      }
    ];
    const categoryDiscountRulesByCategory = new Map([
      [
        "c1",
        [
          {
            global_category_id: "c1",
            promotion_id: "d1",
            percent_bps: 1000,
            max_discount_minor: "500",
            ends_at: "2026-12-31T00:00:00.000Z"
          }
        ]
      ]
    ]);
    const out = withCategoryListingOffers({
      category,
      promotionsPaused: false,
      skuPromoCategoryIds: new Set(["c1"]),
      categoryDiscountRulesByCategory,
      bundleRowsRaw
    });
    expect(out.offers).toEqual({
      has_sku_promo: true,
      has_bundle: true,
      has_category_discount: true
    });
    expect(out.bundle_rules).toHaveLength(1);
    expect(out.category_discount_rules[0]).toMatchObject({
      kind: "category_percent_off",
      percent_bps: 1000
    });
  });

  it("withCategoryListingOffers clears offers when promotions paused", () => {
    const out = withCategoryListingOffers({
      category,
      promotionsPaused: true,
      skuPromoCategoryIds: new Set(["c1"]),
      categoryDiscountRulesByCategory: new Map([["c1", [{ promotion_id: "x" }]]]),
      bundleRowsRaw: [{ scope: "global_category", global_category_id: "c1" }]
    });
    expect(out.offers.has_sku_promo).toBe(false);
    expect(out.bundle_rules).toEqual([]);
  });
});
