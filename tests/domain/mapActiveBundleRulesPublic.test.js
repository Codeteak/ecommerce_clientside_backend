import { describe, it, expect } from "vitest";
import {
  filterBundleRuleRowsForProduct,
  mapActiveBundleRuleRow
} from "../../src/application/services/promotions/mapActiveBundleRulesPublic.js";

describe("mapActiveBundleRuleRow", () => {
  it("filterBundleRuleRowsForProduct matches sku and category", () => {
    const rows = [
      {
        promotion_id: "p1",
        scope: "same_shop_product",
        shop_product_id: "s1",
        global_category_id: null,
        buy_qty: 2,
        get_qty: 1,
        reward_type: "free",
        reward_percent_bps: null,
        ends_at: null
      },
      {
        promotion_id: "p2",
        scope: "global_category",
        shop_product_id: null,
        global_category_id: "c9",
        buy_qty: 1,
        get_qty: 1,
        reward_type: "free",
        reward_percent_bps: null,
        ends_at: null
      }
    ];
    expect(filterBundleRuleRowsForProduct(rows, "s1", "c9")).toHaveLength(2);
    expect(filterBundleRuleRowsForProduct(rows, "s2", "c9")).toHaveLength(1);
    expect(filterBundleRuleRowsForProduct(rows, "s2", null)).toHaveLength(0);
  });

  it("maps same_shop_product row", () => {
    const out = mapActiveBundleRuleRow({
      promotion_id: "p1",
      scope: "same_shop_product",
      shop_product_id: "s1",
      global_category_id: null,
      buy_qty: 2,
      get_qty: 1,
      reward_type: "free",
      reward_percent_bps: null,
      ends_at: new Date("2026-06-01T00:00:00.000Z")
    });
    expect(out).toMatchObject({
      promotion_id: "p1",
      scope: "same_shop_product",
      shop_product_id: "s1",
      buy_qty: 2,
      get_qty: 1,
      reward_type: "free",
      promotion_ends_at: "2026-06-01T00:00:00.000Z"
    });
    expect(out).not.toHaveProperty("global_category_id");
    expect(out).not.toHaveProperty("reward_percent_bps");
  });

  it("includes reward_percent_bps when set", () => {
    const out = mapActiveBundleRuleRow({
      promotion_id: "p1",
      scope: "global_category",
      shop_product_id: null,
      global_category_id: "c1",
      buy_qty: 1,
      get_qty: 1,
      reward_type: "percent_off_reward",
      reward_percent_bps: 500,
      ends_at: "2026-07-01T12:00:00.000Z"
    });
    expect(out.reward_percent_bps).toBe(500);
    expect(out.global_category_id).toBe("c1");
  });
});
