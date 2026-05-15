import { describe, expect, it } from "vitest";
import { evaluateBundleDiscounts } from "../../src/application/services/promotions/evaluateBundleDiscounts.js";

describe("evaluateBundleDiscounts", () => {
  it("buy 2 get 1 free: paid qty 2 shows display 3 and charges for 2", () => {
    const lines = [
      {
        productId: "p1",
        quantity: 2,
        unitFinalMinor: 4500,
        lineTotalMinor: 9000,
        appliedPromotionIds: []
      }
    ];
    const { bundleDiscountMinor } = evaluateBundleDiscounts(
      lines,
      [
        {
          promotion_id: "promo-bogo",
          scope: "same_shop_product",
          shop_product_id: "p1",
          buy_qty: 2,
          get_qty: 1,
          reward_type: "free"
        }
      ],
      { allowCombineAutoCampaigns: true }
    );
    expect(lines[0].paidQuantity).toBe(2);
    expect(lines[0].freeQuantity).toBe(1);
    expect(lines[0].displayQuantity).toBe(3);
    expect(lines[0].linePayableMinor).toBe(9000);
    expect(bundleDiscountMinor).toBe(4500);
  });

  it("buy 2 get 1 free: paid qty 4 shows display 6 and charges for 4", () => {
    const lines = [
      {
        productId: "p1",
        quantity: 4,
        unitFinalMinor: 4500,
        lineTotalMinor: 18000,
        appliedPromotionIds: []
      }
    ];
    evaluateBundleDiscounts(
      lines,
      [
        {
          promotion_id: "promo-bogo",
          scope: "same_shop_product",
          shop_product_id: "p1",
          buy_qty: 2,
          get_qty: 1,
          reward_type: "free"
        }
      ],
      { allowCombineAutoCampaigns: true }
    );
    expect(lines[0].paidQuantity).toBe(4);
    expect(lines[0].freeQuantity).toBe(2);
    expect(lines[0].displayQuantity).toBe(6);
    expect(lines[0].linePayableMinor).toBe(18000);
  });

  it("buy 2 get 1 free: paid qty 1 has no free units", () => {
    const lines = [
      {
        productId: "p1",
        quantity: 1,
        unitFinalMinor: 4500,
        lineTotalMinor: 4500,
        appliedPromotionIds: []
      }
    ];
    evaluateBundleDiscounts(
      lines,
      [
        {
          promotion_id: "promo-bogo",
          scope: "same_shop_product",
          shop_product_id: "p1",
          buy_qty: 2,
          get_qty: 1,
          reward_type: "free"
        }
      ],
      { allowCombineAutoCampaigns: true }
    );
    expect(lines[0].freeQuantity).toBe(0);
    expect(lines[0].displayQuantity).toBe(1);
    expect(lines[0].linePayableMinor).toBe(4500);
  });
});
