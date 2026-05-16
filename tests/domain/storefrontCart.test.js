import { describe, it, expect, vi } from "vitest";
import { ValidationError } from "../../src/domain/errors/ValidationError.js";
import { AppError } from "../../src/domain/errors/AppError.js";
import { createStorefrontCart } from "../../src/application/services/storefront/storefrontCart.js";

const shopId = "00000000-0000-4000-8000-000000000001";
const cartId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const cartItemId = "33333333-3333-4333-8333-333333333333";

function productSnapshot(overrides = {}) {
  return {
    id: productId,
    name: "Apple",
    base_unit: "kg",
    price_minor_per_unit: 100,
    status: "active",
    availability: "in_stock",
    ...overrides
  };
}

function cartLine(overrides = {}) {
  return {
    id: cartItemId,
    product_id: productId,
    title_snapshot: "Apple",
    unit_label: "kg",
    quantity: "2",
    unit_price_minor: 100,
    list_price_minor_per_unit: "100",
    offer_price_minor_per_unit: "90",
    is_custom: false,
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
    findCartByShopAndCustomerId: vi.fn().mockResolvedValue({ id: cartId }),
    insertCart: vi.fn(),
    listCartItems: vi.fn().mockResolvedValue([cartLine()]),
    getProductSnapshotForCart: vi.fn().mockResolvedValue(productSnapshot()),
    findMatchingCartItem: vi.fn().mockResolvedValue(null),
    findCartItemWithCart: vi.fn().mockResolvedValue({
      id: cartItemId,
      cart_id: cartId,
      product_id: productId,
      is_custom: false,
      quantity: "2"
    }),
    updateCartItemSnapshot: vi.fn().mockResolvedValue(cartLine()),
    updateCartItemQuantity: vi.fn().mockResolvedValue(cartLine()),
    insertCartItem: vi.fn().mockResolvedValue(cartLine()),
    deleteCartItem: vi.fn().mockResolvedValue(undefined)
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
  it("increments quantity when same product is added again", async () => {
    const d = deps();
    d.cartRepo.findMatchingCartItem.mockResolvedValue({ id: cartItemId, quantity: "2" });
    d.cartRepo.updateCartItemSnapshot.mockResolvedValue(cartLine({ quantity: "5" }));
    const service = createStorefrontCart(d);
    const out = await service.addItem({}, shopId, { customerId: "cust-1" }, {
      productId,
      quantity: 3
    });

    expect(d.cartRepo.updateCartItemSnapshot).toHaveBeenCalled();
    expect(out.cart_id).toBe(cartId);
    expect(out.promotions).toBeDefined();
    expect(out.summary.subtotal_minor).toBe(180);
  });

  it("returns promotion and coupon blocks on GET cart", async () => {
    const d = deps();
    const service = createStorefrontCart(d);
    const out = await service.getCartContents({}, shopId, { customerId: "cust-1" }, { couponCode: "SAVE10" });

    expect(out.promotions.coupon.code).toBe("SAVE10");
    expect(out.promotions.suggested_coupons).toHaveLength(1);
    expect(out.summary.coupon_discount_minor).toBe(0);
  });

  it("PATCH with delta -1 at quantity 1 returns MINIMUM_QUANTITY", async () => {
    const d = deps();
    d.cartRepo.findCartItemWithCart.mockResolvedValue({
      id: cartItemId,
      cart_id: cartId,
      product_id: productId,
      is_custom: false,
      quantity: "1"
    });
    const service = createStorefrontCart(d);
    await expect(
      service.updateItemQuantity({}, shopId, { customerId: "cust-1" }, cartItemId, { delta: -1 })
    ).rejects.toMatchObject({ code: "MINIMUM_QUANTITY" });
  });

  it("PATCH with delta returns full cart view", async () => {
    const d = deps();
    const service = createStorefrontCart(d);
    const out = await service.updateItemQuantity({}, shopId, { customerId: "cust-1" }, cartItemId, {
      delta: 1,
      couponCode: "SAVE10"
    });

    expect(d.priceStorefrontLines).toHaveBeenCalled();
    expect(out.items.length).toBeGreaterThan(0);
    expect(out.promotions).toBeDefined();
  });

  it("GET cart removes unavailable product lines and returns empty cart", async () => {
    const d = deps();
    d.cartRepo.getProductSnapshotForCart.mockResolvedValue(null);
    d.cartRepo.listCartItems
      .mockResolvedValueOnce([cartLine()])
      .mockResolvedValue([]);
    d.priceStorefrontLines.mockResolvedValue(null);
    const service = createStorefrontCart(d);
    const out = await service.getCartContents({}, shopId, { customerId: "cust-1" });

    expect(d.cartRepo.deleteCartItem).toHaveBeenCalledWith({}, shopId, cartItemId);
    expect(out.items).toEqual([]);
    expect(out.summary.subtotal_minor).toBe(0);
    expect(out.promotions.coupon.status).toBe("none");
  });

  it("rejects when product is unavailable", async () => {
    const d = deps();
    d.cartRepo.getProductSnapshotForCart.mockResolvedValue(null);
    const service = createStorefrontCart(d);
    await expect(
      service.updateItemQuantity({}, shopId, { customerId: "cust-1" }, cartItemId, { delta: 1 })
    ).rejects.toMatchObject({ code: "PRODUCT_UNAVAILABLE" });
  });

  it("returns coupon not_applicable when pricing rejects coupon", async () => {
    const d = deps();
    d.priceStorefrontLines
      .mockRejectedValueOnce(new AppError("Min subtotal", { statusCode: 400, code: "MIN_SUBTOTAL_NOT_MET" }))
      .mockResolvedValueOnce(pricedResult());
    const service = createStorefrontCart(d);
    const out = await service.getCartContents({}, shopId, { customerId: "cust-1" }, {
      couponCode: "SAVE10"
    });

    expect(out.promotions.coupon.status).toBe("not_applicable");
    expect(out.promotions.coupon.reason_code).toBe("MIN_SUBTOTAL_NOT_MET");
  });

  it("DELETE returns empty cart with coupon none", async () => {
    const d = deps();
    d.cartRepo.listCartItems.mockResolvedValueOnce([cartLine()]).mockResolvedValue([]);
    d.cartRepo.findCartItemWithCart.mockResolvedValue({
      id: cartItemId,
      cart_id: cartId,
      product_id: productId,
      is_custom: false,
      quantity: "2"
    });
    d.priceStorefrontLines.mockResolvedValue(null);
    const service = createStorefrontCart(d);
    const out = await service.removeItem({}, shopId, { customerId: "cust-1" }, cartItemId, {});

    expect(out.items).toEqual([]);
    expect(out.promotions.coupon.status).toBe("none");
  });

  it("adds separate bundle-reward line in cart view", async () => {
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
    const out = await service.getCartContents({}, shopId, { customerId: "cust-1" });

    expect(out.items).toHaveLength(2);
    expect(out.items[0].quantity).toMatchObject({ billable: 2, paid: 2, free: 1, display: 3 });
    expect(out.items[1].is_bundle_reward).toBe(true);
    expect(out.items[1].quantity).toMatchObject({ free: 1, display: 1 });
    expect(out.items[1].bundle_source_item_id).toBe(cartItemId);
    expect(out.items[0].pricing).toHaveProperty("list_minor");
    expect(out.items[0].promo.types).toContain("bundle");
  });

  it("rejects PATCH on synthetic bundle-reward cart item ids", async () => {
    const d = deps();
    const service = createStorefrontCart(d);
    await expect(
      service.updateItemQuantity(
        {},
        shopId,
        { customerId: "cust-1" },
        `${cartItemId}:bundle-reward`,
        { delta: 1 }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
