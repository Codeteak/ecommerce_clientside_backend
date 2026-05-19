import { describe, expect, it, vi } from "vitest";
import { createPriceStorefrontLines } from "../../src/application/services/promotions/priceStorefrontLines.js";

/** @type {import("pg").PoolClient} */
const fakeClient = /** @type {any} */ ({});

const shopId = "00000000-0000-4000-8000-000000000001";
const productId = "11111111-1111-4111-8111-111111111111";

function basePromotionRepo(overrides = {}) {
  return {
    getShopPromotionSettings: vi.fn().mockResolvedValue({
      promotions_paused: false,
      default_overlap_mode: "priority",
      allow_combine_auto_campaigns: true,
      first_coupon_eligibility_days: 30
    }),
    listActivePromotionProductOverlaysForShopProducts: vi.fn().mockResolvedValue([]),
    listActiveBundleRulesForShop: vi.fn().mockResolvedValue([]),
    findCouponByCodeForShop: vi.fn().mockResolvedValue(null),
    ...overrides
  };
}

describe("createPriceStorefrontLines", () => {
  it("prices lines with catalog offer baseline", async () => {
    const price = createPriceStorefrontLines({ promotionRepo: basePromotionRepo() });
    const out = await price(fakeClient, {
      shopId,
      lines: [{ productId, quantity: 2, listMinor: 1000, offerMinor: 800 }]
    });
    expect(out.subtotalMinor).toBe(1600);
    expect(out.lines[0].final_price_minor).toBe("800");
  });

  it("applies SKU promo overlay winner", async () => {
    const price = createPriceStorefrontLines({
      promotionRepo: basePromotionRepo({
        listActivePromotionProductOverlaysForShopProducts: vi.fn().mockResolvedValue([
          {
            shop_product_id: productId,
            promotion_id: "promo-sku",
            promo_price_minor_per_unit: "500",
            priority: 1,
            overlap_mode: "priority",
            created_at: new Date("2026-01-01")
          }
        ])
      })
    });
    const out = await price(fakeClient, {
      shopId,
      lines: [{ productId, quantity: 1, listMinor: 1000, offerMinor: null }]
    });
    expect(out.subtotalMinor).toBe(500);
    expect(out.appliedPromotionIds).toContain("promo-sku");
    expect(out.appliedPromotionDiscounts).toEqual([
      { promotionId: "promo-sku", discountMinor: 500 }
    ]);
  });

  it("rejects empty cart with coupon code", async () => {
    const price = createPriceStorefrontLines({ promotionRepo: basePromotionRepo() });
    await expect(
      price(fakeClient, { shopId, lines: [], couponCode: "SAVE10" })
    ).rejects.toMatchObject({ code: "EMPTY_CART_WITH_COUPON" });
  });

  it("applies coupon percent off on priced subtotal", async () => {
    const price = createPriceStorefrontLines({
      promotionRepo: basePromotionRepo({
        findCouponByCodeForShop: vi.fn().mockResolvedValue({
          id: "coupon-1",
          promotion_id: "promo-coupon",
          code_normalized: "SAVE10",
          min_subtotal_minor: null,
          first_order_only: false,
          new_customer_only: false,
          max_redemptions_total: null,
          max_redemptions_per_customer: null,
          total_redemptions: 0,
          customer_redemptions: 0,
          has_sku_products: false,
          has_bundle_rules: false,
          has_coupon_rules: true,
          promotion_rules: [{ rule_kind: "cart_percent_off", percent_bps: 1000 }]
        })
      }),
      authRepo: {
        getCustomerCreatedAtById: vi.fn().mockResolvedValue({ created_at: new Date() })
      },
      orderRepo: { countDeliveredOrdersForCustomer: vi.fn().mockResolvedValue(0) }
    });
    const out = await price(fakeClient, {
      shopId,
      customerId: "cust-1",
      couponCode: "save10",
      lines: [{ productId, quantity: 1, listMinor: 1000, offerMinor: null }]
    });
    expect(out.couponDiscountMinor).toBe(100);
    expect(out.subtotalMinor).toBe(900);
    expect(out.coupon?.code).toBe("SAVE10");
  });

  it("buy 2 get 1: qty 2 in cart returns display 3 and subtotal for 2 paid units", async () => {
    const price = createPriceStorefrontLines({
      promotionRepo: basePromotionRepo({
        listActiveBundleRulesForShop: vi.fn().mockResolvedValue([
          {
            promotion_id: "promo-bogo",
            scope: "same_shop_product",
            shop_product_id: productId,
            buy_qty: 2,
            get_qty: 1,
            reward_type: "free"
          }
        ])
      })
    });
    const out = await price(fakeClient, {
      shopId,
      lines: [{ productId, quantity: 2, listMinor: 5000, offerMinor: 4500 }]
    });
    expect(out.lines[0].paid_quantity).toBe(2);
    expect(out.lines[0].free_quantity).toBe(1);
    expect(out.lines[0].quantity).toBe(2);
    expect(out.lines[0].display_quantity).toBe(3);
    expect(out.subtotalMinor).toBe(9000);
    expect(out.lines[0].line_total_minor).toBe("9000");
    expect(out.appliedPromotionDiscounts).toEqual([
      { promotionId: "promo-bogo", discountMinor: 4500 }
    ]);
  });
});
