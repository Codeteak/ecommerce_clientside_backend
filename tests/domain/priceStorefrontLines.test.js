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

  it("charges pack count times unit size times price per kg", async () => {
    const price = createPriceStorefrontLines({ promotionRepo: basePromotionRepo() });
    const oneStep = await price(fakeClient, {
      shopId,
      lines: [{ productId, quantity: 1, listMinor: 10000, offerMinor: null, unitSize: 0.25 }]
    });
    expect(oneStep.subtotalMinor).toBe(2500);
    expect(oneStep.lines[0].final_price_minor).toBe("10000");
    expect(oneStep.lines[0].line_total_minor).toBe("2500");

    const doubleStep = await price(fakeClient, {
      shopId,
      lines: [{ productId, quantity: 2, listMinor: 10000, offerMinor: null, unitSize: 0.25 }]
    });
    expect(doubleStep.subtotalMinor).toBe(5000);
    expect(doubleStep.lines[0].line_total_minor).toBe("5000");
  });

  it("bills 255 g at the same per-kg price", async () => {
    const price = createPriceStorefrontLines({ promotionRepo: basePromotionRepo() });
    const out = await price(fakeClient, {
      shopId,
      lines: [{ productId, quantity: 0.255, listMinor: 10000, offerMinor: null, unitSize: 1, soldByWeight: true }]
    });
    expect(out.subtotalMinor).toBe(2550);
    expect(out.lines[0].final_price_minor).toBe("10000");
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

  it("rejects coupons when Buy X Get Y free units apply", async () => {
    const price = createPriceStorefrontLines({
      promotionRepo: basePromotionRepo({
        listActiveBundleRulesForShop: vi.fn().mockResolvedValue([
          {
            promotion_id: "promo-bogo",
            scope: "same_shop_product",
            shop_product_id: productId,
            buy_qty: 1,
            get_qty: 1,
            reward_type: "free"
          }
        ]),
        findCouponByCodeForShop: vi.fn().mockResolvedValue({
          id: "c1",
          code_normalized: "SAVE10",
          promotion_id: "promo-coupon",
          has_coupon_rules: true,
          has_sku_products: false,
          min_subtotal_minor: 0
        })
      })
    });
    const out = await price(fakeClient, {
      shopId,
      couponCode: "SAVE10",
      invalidCouponBehavior: "omit",
      lines: [{ productId, quantity: 1, listMinor: 1000, offerMinor: null }]
    });
    expect(out.couponRejected?.code).toBe("COUPON_NOT_WITH_BUNDLE");
    expect(out.couponDiscountMinor).toBe(0);
    expect(out.lines[0].free_quantity).toBe(1);
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

  it("does not inject cross BXGY free SKU when reward is not sellable (out of stock)", async () => {
    const buyId = productId;
    const rewardId = "22222222-2222-4222-8222-222222222222";
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [] })
    };
    const price = createPriceStorefrontLines({
      promotionRepo: basePromotionRepo({
        listActiveBundleRulesForShop: vi.fn().mockResolvedValue([
          {
            promotion_id: "promo-cross",
            scope: "cross_shop_products",
            buy_shop_product_id: buyId,
            reward_shop_product_id: rewardId,
            buy_qty: 1,
            get_qty: 1,
            reward_type: "free"
          }
        ])
      })
    });

    const out = await price(client, {
      shopId,
      lines: [{ productId: buyId, quantity: 1, listMinor: 1000, offerMinor: null }]
    });

    expect(client.query).toHaveBeenCalled();
    expect(String(client.query.mock.calls[0][0])).toMatch(/availability = 'in_stock'/);
    expect(out.lines.some((l) => String(l.productId) === rewardId)).toBe(false);
    expect(out.lines).toHaveLength(1);
  });

  it("injects cross BXGY free SKU when reward is sellable", async () => {
    const buyId = productId;
    const rewardId = "22222222-2222-4222-8222-222222222222";
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: rewardId,
            price_minor_per_unit: "500",
            offer_price_minor_per_unit: null,
            global_category_id: null,
            name: "Free snack",
            image_url: null,
            thumb_storage_key: null,
            base_unit: "pcs"
          }
        ]
      })
    };
    const price = createPriceStorefrontLines({
      promotionRepo: basePromotionRepo({
        listActiveBundleRulesForShop: vi.fn().mockResolvedValue([
          {
            promotion_id: "promo-cross",
            scope: "cross_shop_products",
            buy_shop_product_id: buyId,
            reward_shop_product_id: rewardId,
            buy_qty: 1,
            get_qty: 1,
            reward_type: "free"
          }
        ])
      })
    });

    const out = await price(client, {
      shopId,
      lines: [{ productId: buyId, quantity: 1, listMinor: 1000, offerMinor: null }]
    });

    const freeLine = out.lines.find((l) => String(l.productId) === rewardId);
    expect(freeLine).toBeTruthy();
    expect(freeLine.injected_bundle_reward).toBe(true);
    expect(freeLine.paid_quantity).toBe(0);
    expect(freeLine.free_quantity).toBe(1);
    expect(Number(freeLine.line_total_minor)).toBe(0);
  });
});
