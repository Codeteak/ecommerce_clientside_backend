import { describe, it, expect, vi } from "vitest";
import { filterBundleRuleRowsForProduct } from "../../src/application/services/promotions/mapActiveBundleRulesPublic.js";

/**
 * Regression: product detail must surface cross BXGY (buy this → get that)
 * the same way home Offer Damaka does. The repo query used to omit
 * scope=cross_shop_products, so Amul Ghee PDP showed no offers.
 */
describe("product detail cross BXGY matching", () => {
  it("includes cross rules when product is the buy SKU", () => {
    const amul = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const upma = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const rows = [
      {
        promotion_id: "promo-cross",
        scope: "cross_shop_products",
        shop_product_id: null,
        global_category_id: null,
        buy_shop_product_id: amul,
        reward_shop_product_id: upma,
        buy_qty: 1,
        get_qty: 1,
        reward_type: "free",
        buy_product_name: "AMUL GHEE 1 LTR TIN 1L",
        reward_product_name: "ADUKALE UPMA MIX"
      }
    ];
    const forAmul = filterBundleRuleRowsForProduct(rows, amul, null);
    expect(forAmul).toHaveLength(1);
    expect(forAmul[0].reward_shop_product_id).toBe(upma);
  });

  it("includes cross rules when product is the free reward SKU", () => {
    const amul = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const upma = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const rows = [
      {
        promotion_id: "promo-cross",
        scope: "cross_shop_products",
        buy_shop_product_id: amul,
        reward_shop_product_id: upma,
        buy_qty: 1,
        get_qty: 1,
        reward_type: "free"
      }
    ];
    expect(filterBundleRuleRowsForProduct(rows, upma, null)).toHaveLength(1);
  });
});
