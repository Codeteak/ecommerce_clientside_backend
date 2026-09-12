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
      default_allow_coupon_after_auto: true,
      default_stack_sku_with_cart: false,
      default_stack_sku_with_category: false,
      default_stack_category_with_cart: false,
      first_coupon_eligibility_days: 30
    }),
    listActivePromotionProductOverlaysForShopProducts: vi.fn().mockResolvedValue([]),
    listActiveBundleRulesForShop: vi.fn().mockResolvedValue([]),
    listActiveAutoCartRulesForShop: vi.fn().mockResolvedValue([]),
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

  it("invalidCouponBehavior omit returns base pricing and couponRejected without second pricing pass", async () => {
    const price = createPriceStorefrontLines({ promotionRepo: basePromotionRepo() });
    const out = await price(fakeClient, {
      shopId,
      customerId: "cust-1",
      couponCode: "BADCODE",
      invalidCouponBehavior: "omit",
      lines: [{ productId, quantity: 1, listMinor: 1000, offerMinor: null }]
    });
    expect(out.couponRejected).toMatchObject({ code: "COUPON_NOT_FOUND" });
    expect(out.subtotalMinor).toBe(1000);
    expect(out.couponDiscountMinor).toBe(0);
    expect(out.coupon).toBeNull();
  });

  it("default throw on invalid coupon when omit not set", async () => {
    const price = createPriceStorefrontLines({ promotionRepo: basePromotionRepo() });
    await expect(
      price(fakeClient, {
        shopId,
        customerId: "cust-1",
        couponCode: "BADCODE",
        lines: [{ productId, quantity: 1, listMinor: 1000, offerMinor: null }]
      })
    ).rejects.toMatchObject({ code: "COUPON_NOT_FOUND" });
  });

  it("applies automatic cart percent off without a coupon", async () => {
    const price = createPriceStorefrontLines({
      promotionRepo: basePromotionRepo({
        listActiveAutoCartRulesForShop: vi.fn().mockResolvedValue([
          {
            promotion_id: "promo-auto",
            rule_kind: "cart_percent_off",
            percent_bps: 1000,
            priority: 10,
            created_at: new Date("2026-01-01"),
            stack_sku_with_cart: true
          }
        ])
      })
    });
    const out = await price(fakeClient, {
      shopId,
      lines: [{ productId, quantity: 1, listMinor: 1000, offerMinor: null }]
    });
    expect(out.autoCartDiscountMinor).toBe(100);
    expect(out.subtotalMinor).toBe(900);
    expect(out.appliedPromotionIds).toContain("promo-auto");
  });

  it("applies multiple coupons sequentially reducing remaining subtotal", async () => {
    const findCoupon = vi.fn().mockImplementation(async (_c, _shop, code) => {
      if (code === "SAVE10") {
        return {
          id: "coupon-1",
          promotion_id: "promo-c1",
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
        };
      }
      if (code === "FLAT50") {
        return {
          id: "coupon-2",
          promotion_id: "promo-c2",
          code_normalized: "FLAT50",
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
          promotion_rules: [{ rule_kind: "cart_fixed_off", amount_minor: 50 }]
        };
      }
      return null;
    });
    const price = createPriceStorefrontLines({
      promotionRepo: basePromotionRepo({
        getShopPromotionSettings: vi.fn().mockResolvedValue({
          promotions_paused: false,
          default_overlap_mode: "priority",
          allow_combine_auto_campaigns: true,
          default_allow_coupon_after_auto: true,
          default_stack_sku_with_cart: false,
          default_stack_sku_with_category: false,
          default_stack_category_with_cart: false,
          first_coupon_eligibility_days: 30,
          max_coupons_per_order: 2
        }),
        findCouponByCodeForShop: findCoupon
      })
    });
    const out = await price(fakeClient, {
      shopId,
      couponCodes: ["save10", "flat50"],
      lines: [{ productId, quantity: 1, listMinor: 1000, offerMinor: null }]
    });
    // 10% of 1000 = 100, then flat 50 of remaining 900
    expect(out.couponDiscountMinor).toBe(150);
    expect(out.subtotalMinor).toBe(850);
    expect(out.couponCodesNormalized).toEqual(["SAVE10", "FLAT50"]);
    expect(out.appliedCoupons).toHaveLength(2);
    expect(out.coupon?.code).toBe("SAVE10");
    expect(out.couponCodeNormalized).toBe("SAVE10");
    expect(out.couponId).toBe("coupon-1");
    expect(out.couponPromotionId).toBe("promo-c1");
  });

  it("clamps couponCodes to max_coupons_per_order", async () => {
    const findCoupon = vi.fn().mockImplementation(async (_c, _shop, code) => ({
      id: `coupon-${code}`,
      promotion_id: `promo-${code}`,
      code_normalized: code,
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
      promotion_rules: [{ rule_kind: "cart_fixed_off", amount_minor: 10 }]
    }));
    const price = createPriceStorefrontLines({
      promotionRepo: basePromotionRepo({
        getShopPromotionSettings: vi.fn().mockResolvedValue({
          promotions_paused: false,
          default_overlap_mode: "priority",
          allow_combine_auto_campaigns: true,
          default_allow_coupon_after_auto: true,
          default_stack_sku_with_cart: false,
          default_stack_sku_with_category: false,
          default_stack_category_with_cart: false,
          first_coupon_eligibility_days: 30,
          max_coupons_per_order: 1
        }),
        findCouponByCodeForShop: findCoupon
      })
    });
    const out = await price(fakeClient, {
      shopId,
      couponCode: "FIRST",
      couponCodes: ["SECOND"],
      lines: [{ productId, quantity: 1, listMinor: 1000, offerMinor: null }]
    });
    expect(out.couponCodesNormalized).toEqual(["FIRST"]);
    expect(findCoupon).toHaveBeenCalledTimes(1);
    expect(findCoupon.mock.calls[0][2]).toBe("FIRST");
  });

  it("omit mode skips invalid coupon and still applies a later valid code", async () => {
    const findCoupon = vi.fn().mockImplementation(async (_c, _shop, code) => {
      if (code === "BAD") return null;
      return {
        id: "coupon-ok",
        promotion_id: "promo-ok",
        code_normalized: "GOOD",
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
        promotion_rules: [{ rule_kind: "cart_fixed_off", amount_minor: 25 }]
      };
    });
    const price = createPriceStorefrontLines({
      promotionRepo: basePromotionRepo({
        getShopPromotionSettings: vi.fn().mockResolvedValue({
          promotions_paused: false,
          default_overlap_mode: "priority",
          allow_combine_auto_campaigns: true,
          default_allow_coupon_after_auto: true,
          default_stack_sku_with_cart: false,
          default_stack_sku_with_category: false,
          default_stack_category_with_cart: false,
          first_coupon_eligibility_days: 30,
          max_coupons_per_order: 2
        }),
        findCouponByCodeForShop: findCoupon
      })
    });
    const out = await price(fakeClient, {
      shopId,
      couponCodes: ["BAD", "GOOD"],
      invalidCouponBehavior: "omit",
      lines: [{ productId, quantity: 1, listMinor: 1000, offerMinor: null }]
    });
    expect(out.couponRejected).toMatchObject({ code: "COUPON_NOT_FOUND" });
    expect(out.couponCodesNormalized).toEqual(["GOOD"]);
    expect(out.couponDiscountMinor).toBe(25);
  });
});
