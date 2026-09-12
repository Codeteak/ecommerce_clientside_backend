import { describe, it, expect, vi } from "vitest";
import { AppError } from "../../src/domain/errors/AppError.js";
import { createStorefrontCart } from "../../src/application/services/storefront/storefrontCart.js";

const shopId = "00000000-0000-4000-8000-000000000001";
const productId = "22222222-2222-4222-8222-222222222222";
const cartItemId = "33333333-3333-4333-8333-333333333333";

function cartLine(overrides = {}) {
  return {
    id: cartItemId,
    product_id: productId,
    title_snapshot: "Apple",
    unit_label: "kg",
    unit_size_snapshot: "2",
    quantity: "2",
    unit_price_minor: 100,
    list_price_minor_per_unit: "100",
    offer_price_minor_per_unit: "90",
    is_custom: false,
    global_category_id: null,
    ...overrides
  };
}

function pricedResult(cartItemIdOverride = cartItemId) {
  return {
    subtotalMinor: 180,
    subtotalBeforeCouponMinor: 200,
    promotionDiscountTotalMinor: 20,
    linePromoDiscountMinor: 10,
    bundleDiscountMinor: 10,
    couponDiscountMinor: 0,
    appliedPromotionIds: ["promo-1"],
    promotionsPaused: false,
    lines: [
      {
        cartItemId: cartItemIdOverride,
        paid_quantity: 2,
        free_quantity: 0,
        display_quantity: 2,
        list_price_minor: "100",
        final_price_minor: "90",
        line_total_minor: "180",
        offer_discount_minor: "0",
        promo_discount_minor: "10",
        total_discount_minor: "20",
        applied_promotion_ids: ["promo-1"]
      }
    ],
    coupon: null
  };
}

function deps(overrides = {}) {
  const baseCartRepo = {
    validateClientLinesForCheckout: vi.fn().mockResolvedValue([cartLine()]),
    enrichCartItemsForView: vi.fn().mockImplementation(async (_c, _s, items) => items),
    findCartByShopAndCustomerId: vi.fn(),
    insertCart: vi.fn(),
    listCartItems: vi.fn(),
    listProductSnapshotsForCart: vi.fn(),
    findMatchingCartItem: vi.fn(),
    findCartItemWithCart: vi.fn(),
    updateCartItemSnapshot: vi.fn(),
    updateCartItemQuantity: vi.fn(),
    insertCartItem: vi.fn(),
    deleteCartItem: vi.fn()
  };

  return {
    cartRepo: { ...baseCartRepo, ...(overrides.cartRepo ?? {}) },
    ensureShopForCatalog: overrides.ensureShopForCatalog ?? vi.fn().mockResolvedValue(undefined),
    priceStorefrontLines: overrides.priceStorefrontLines ?? vi.fn().mockResolvedValue(pricedResult()),
    listApplicableCoupons:
      overrides.listApplicableCoupons ??
      vi.fn().mockResolvedValue({
        promotionsPaused: false,
        settings: {},
        coupons: [
          {
            code: "SAVE10",
            eligibility: { applicable: true, ineligibilityCodes: [] }
          }
        ]
      })
  };
}

describe("storefront cart", () => {
  it("returns empty cart for GET without Redis", async () => {
    const service = createStorefrontCart(deps());
    const out = await service.getCartContents({}, shopId, { customerId: "cust-1" });
    expect(out.cart_id).toBeNull();
    expect(out.items).toEqual([]);
    expect(out.summary.subtotal_minor).toBe(0);
  });

  it("retires createOrGetCart with 410", async () => {
    const service = createStorefrontCart(deps());
    await expect(service.createOrGetCart({}, shopId, { customerId: "cust-1" })).rejects.toMatchObject({
      code: "CART_SERVER_RETIRED",
      statusCode: 410
    });
  });

  it("retires addItem with 410", async () => {
    const service = createStorefrontCart(deps());
    await expect(
      service.addItem({}, shopId, { customerId: "cust-1" }, { productId, quantity: 1 })
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      service.addItem({}, shopId, { customerId: "cust-1" }, { productId, quantity: 1 })
    ).rejects.toMatchObject({ code: "CART_SERVER_RETIRED" });
  });

  it("retires updateItemQuantity and removeItem with 410", async () => {
    const service = createStorefrontCart(deps());
    await expect(
      service.updateItemQuantity({}, shopId, { customerId: "cust-1" }, cartItemId, { delta: 1 })
    ).rejects.toMatchObject({ code: "CART_SERVER_RETIRED" });
    await expect(
      service.removeItem({}, shopId, { customerId: "cust-1" }, cartItemId, {})
    ).rejects.toMatchObject({ code: "CART_SERVER_RETIRED" });
  });

  it("previews client items with coupon and suggested coupons", async () => {
    const d = deps();
    const service = createStorefrontCart(d);
    const out = await service.previewFromClientItems({}, shopId, { customerId: "cust-1" }, {
      items: [{ productId, quantity: 2 }],
      couponCode: "SAVE10"
    });

    expect(d.cartRepo.validateClientLinesForCheckout).toHaveBeenCalled();
    expect(d.cartRepo.enrichCartItemsForView).toHaveBeenCalled();
    expect(d.priceStorefrontLines).toHaveBeenCalled();
    expect(out.cart_id).toBeNull();
    expect(out.promotions.coupon.code).toBe("SAVE10");
    expect(out.promotions.suggested_coupons).toHaveLength(1);
    expect(out.summary.subtotal_minor).toBe(180);
  });

  it("returns coupon not_applicable when pricing rejects coupon on preview", async () => {
    const d = deps();
    d.priceStorefrontLines.mockResolvedValueOnce({
      ...pricedResult(),
      couponRejected: { code: "MIN_SUBTOTAL_NOT_MET", message: "Min subtotal" }
    });
    const service = createStorefrontCart(d);
    const out = await service.previewFromClientItems({}, shopId, { customerId: "cust-1" }, {
      items: [{ productId, quantity: 2 }],
      couponCode: "SAVE10"
    });

    expect(out.promotions.coupon.status).toBe("not_applicable");
    expect(out.promotions.coupon.reason_code).toBe("MIN_SUBTOTAL_NOT_MET");
  });

  it("exposes offer_quantity on preview for bundle promos", async () => {
    const d = deps();
    d.priceStorefrontLines.mockResolvedValue({
      ...pricedResult(),
      lines: [
        {
          ...pricedResult().lines[0],
          free_quantity: 1,
          display_quantity: 3
        }
      ]
    });
    const service = createStorefrontCart(d);
    const out = await service.previewFromClientItems({}, shopId, { customerId: "cust-1" }, {
      items: [{ productId, quantity: 2 }]
    });

    expect(out.items).toHaveLength(1);
    expect(out.items[0].quantity).toBe(2);
    expect(out.items[0].offer_quantity).toBe(1);
    expect(out.summary.units_display_total).toBe(3);
  });

  it("skips suggested coupons when includeSuggestedCoupons is false", async () => {
    const d = deps();
    const service = createStorefrontCart(d);
    await service.previewFromClientItems({}, shopId, { customerId: "cust-1" }, {
      items: [{ productId, quantity: 2 }],
      includeSuggestedCoupons: false
    });

    expect(d.listApplicableCoupons).not.toHaveBeenCalled();
  });

  it("returns empty view when preview items array is empty", async () => {
    const d = deps();
    const service = createStorefrontCart(d);
    const out = await service.previewFromClientItems({}, shopId, { customerId: "cust-1" }, {
      items: []
    });
    expect(out.items).toEqual([]);
    expect(d.cartRepo.validateClientLinesForCheckout).not.toHaveBeenCalled();
  });
});
