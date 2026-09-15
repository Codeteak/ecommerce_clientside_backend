import { describe, expect, it } from "vitest";
import {
  evaluateBundleDiscounts,
  planCrossRewardInjections
} from "../../src/application/services/promotions/evaluateBundleDiscounts.js";

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

  it("category BOGO tags every matched line with appliedPromotionIds", () => {
    const lines = [
      {
        productId: "cheap",
        categoryId: "dairy",
        quantity: 1,
        unitFinalMinor: 3000,
        lineTotalMinor: 3000,
        appliedPromotionIds: []
      },
      {
        productId: "pricey",
        categoryId: "dairy",
        quantity: 1,
        unitFinalMinor: 5000,
        lineTotalMinor: 5000,
        appliedPromotionIds: []
      }
    ];
    evaluateBundleDiscounts(
      lines,
      [
        {
          promotion_id: "promo-cat-bogo",
          scope: "global_category",
          global_category_id: "dairy",
          buy_qty: 2,
          get_qty: 1,
          reward_type: "free"
        }
      ],
      { allowCombineAutoCampaigns: true }
    );
    expect(lines[0].freeQuantity + lines[1].freeQuantity).toBe(1);
    expect(lines[0].appliedPromotionIds).toContain("promo-cat-bogo");
    expect(lines[1].appliedPromotionIds).toContain("promo-cat-bogo");
  });

  it("cross: buy A unlocks free B when B is in cart", () => {
    const lines = [
      {
        productId: "ghee",
        quantity: 1,
        unitFinalMinor: 76500,
        lineTotalMinor: 76500,
        appliedPromotionIds: []
      },
      {
        productId: "upma",
        quantity: 1,
        unitFinalMinor: 12000,
        lineTotalMinor: 12000,
        appliedPromotionIds: []
      }
    ];
    const { bundleDiscountMinor } = evaluateBundleDiscounts(
      lines,
      [
        {
          promotion_id: "promo-cross",
          scope: "cross_shop_products",
          buy_shop_product_id: "ghee",
          reward_shop_product_id: "upma",
          buy_qty: 1,
          get_qty: 1,
          reward_type: "free"
        }
      ],
      { allowCombineAutoCampaigns: true }
    );
    expect(lines[0].paidQuantity).toBe(1);
    expect(lines[0].freeQuantity).toBe(0);
    expect(lines[1].paidQuantity).toBe(0);
    expect(lines[1].freeQuantity).toBe(1);
    expect(lines[1].linePayableMinor).toBe(0);
    expect(bundleDiscountMinor).toBe(12000);
  });

  it("planCrossRewardInjections adds missing free reward SKU", () => {
    const plan = planCrossRewardInjections(
      [{ productId: "ghee", quantity: 1 }],
      [
        {
          promotion_id: "promo-cross",
          scope: "cross_shop_products",
          buy_shop_product_id: "ghee",
          reward_shop_product_id: "upma",
          buy_qty: 1,
          get_qty: 1,
          reward_type: "free"
        }
      ]
    );
    expect(plan).toEqual([{ productId: "upma", quantity: 1, promotionId: "promo-cross" }]);
  });

  it("planCrossRewardInjections skips when reward already in cart", () => {
    const plan = planCrossRewardInjections(
      [
        { productId: "ghee", quantity: 1 },
        { productId: "upma", quantity: 1 }
      ],
      [
        {
          promotion_id: "promo-cross",
          scope: "cross_shop_products",
          buy_shop_product_id: "ghee",
          reward_shop_product_id: "upma",
          buy_qty: 1,
          get_qty: 1,
          reward_type: "free"
        }
      ]
    );
    expect(plan).toEqual([]);
  });
});
