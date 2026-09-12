import { describe, it, expect, vi } from "vitest";
import { AppError } from "../../src/domain/errors/AppError.js";
import { createCheckoutStorefront } from "../../src/application/services/checkout/checkoutStorefront.js";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ITEMS = [{ productId: PRODUCT_ID, quantity: 1 }];

function clientValidatedLine(overrides = {}) {
  return {
    id: "cart-item-1",
    product_id: PRODUCT_ID,
    title_snapshot: "A",
    unit_label: "kg",
    quantity: "1",
    unit_price_minor: 100,
    is_custom: false,
    custom_note: null,
    ...overrides
  };
}

function checkoutInput(extra = {}) {
  return {
    shopId: "00000000-0000-4000-8000-000000000001",
    customerId: "cust-1",
    userId: "user-1",
    items: CLIENT_ITEMS,
    ...extra
  };
}

function deps() {
  return {
    cartRepo: {
      findCartByShopAndCustomerId: vi.fn().mockResolvedValue({ id: "cart-1" }),
      validateClientLinesForCheckout: vi.fn().mockResolvedValue([clientValidatedLine()]),
      validateCartForCheckoutCommit: vi.fn().mockRejectedValue(
        new AppError("Server cart checkout is retired", { statusCode: 410, code: "CART_SERVER_RETIRED" })
      ),
      getProductSnapshotForCart: vi.fn().mockResolvedValue({
        id: PRODUCT_ID,
        name: "A",
        base_unit: "kg",
        price_minor_per_unit: 100,
        status: "active",
        availability: "in_stock"
      }),
      deleteCartItemsForCart: vi.fn().mockResolvedValue(undefined),
      deleteCart: vi.fn().mockResolvedValue(undefined),
      listLiveProductPricingByIds: vi.fn().mockResolvedValue([
        {
          id: PRODUCT_ID,
          price_minor_per_unit: "100",
          offer_price_minor_per_unit: null,
          global_category_id: null
        }
      ]),
    },
    orderRepo: {
      insertOrderWithItemsAndOutbox: vi.fn().mockResolvedValue({ id: "order-1" }),
      insertOutboxEvent: vi.fn().mockResolvedValue(undefined),
      acquireCheckoutIdempotencyLock: vi.fn().mockResolvedValue(undefined),
      findCheckoutIdempotencyOrderId: vi.fn().mockResolvedValue(null),
      insertCheckoutIdempotency: vi.fn().mockResolvedValue(undefined),
      getOrderSummaryForCheckoutReplay: vi.fn().mockResolvedValue(null)
    },
    authRepo: {
      getMembershipByCustomerAndShop: vi.fn().mockResolvedValue({
        is_active: true,
        is_blocked: false,
        is_deleted: false
      }),
      getCustomerProfileByCustomerId: vi.fn().mockResolvedValue({
        id: "cust-1",
        user_id: "user-1",
        phone: "+919999999999",
        is_blocked: false,
        is_deleted: false,
        display_name: "John",
        address: {
          id: "22222222-2222-4222-8222-222222222222",
          line1: "x",
          lat: 12.9,
          lng: 77.5
        }
      })
    },
    checkShopServiceArea: vi.fn().mockResolvedValue({ inServiceArea: true }),
    deliveryFeeMinor: 20
  };
}

function pricedDeps(overrides = {}) {
  const priceStorefrontLines = vi.fn().mockResolvedValue({
    subtotalMinor: 90,
    promotionDiscountTotalMinor: 10,
    couponDiscountMinor: 10,
    appliedPromotionIds: ["promo-1"],
    coupon: { id: "coupon-1", code: "SAVE10", promotionId: "promo-1", discountMinor: 10 },
    lines: [
      {
        cartItemId: "cart-item-1",
        productId: "11111111-1111-4111-8111-111111111111",
        quantity: 1,
        list_price_minor: "100",
        total_price_minor: "100",
        final_price_minor: "90",
        line_total_minor: "90",
        offer_discount_minor: "0",
        promo_discount_minor: "0",
        total_discount_minor: "10",
        applied_promotion_ids: []
      }
    ]
  });
  return {
    ...deps(),
    priceStorefrontLines,
    promotionRepo: { insertPromotionRedemption: vi.fn().mockResolvedValue(undefined) },
    ...overrides
  };
}

describe("checkoutStorefront validations", () => {
  it("allows checkout when customer phone is missing", async () => {
    const d = deps();
    d.authRepo.getCustomerProfileByCustomerId = vi.fn().mockResolvedValue({
      id: "cust-1",
      user_id: "user-1",
      phone: null,
      is_blocked: false,
      is_deleted: false,
      display_name: "John",
      address: {
        id: "22222222-2222-4222-8222-222222222222",
        line1: "x",
        lat: 12.9,
        lng: 77.5
      }
    });
    const run = createCheckoutStorefront(d);
    const out = await run({}, checkoutInput());
    expect(out).toMatchObject({
      orderId: "order-1",
      total_minor: 120
    });
    expect(d.orderRepo.insertOrderWithItemsAndOutbox).toHaveBeenCalledTimes(1);
  });

  it("uses profile address even when a different addressId is provided", async () => {
    const d = deps();
    const run = createCheckoutStorefront(d);
    const out = await run({}, checkoutInput({
        addressId: "33333333-3333-4333-8333-333333333333"
      }));
    expect(out).toMatchObject({ orderId: "order-1", total_minor: 120 });
  });

  it("fails when address is outside service area", async () => {
    const d = deps();
    d.checkShopServiceArea = vi.fn().mockResolvedValue({
      inServiceArea: false,
      distanceM: 6200,
      maxRadiusM: 5000
    });
    const run = createCheckoutStorefront(d);
    await expect(run({}, checkoutInput())).rejects.toMatchObject({ code: "ADDRESS_NOT_SERVICEABLE" });
    await expect(run({}, checkoutInput())).rejects.toMatchObject({
      message: expect.stringContaining("distance 6200m, max 5000m")
    });
  });

  it("fails when any cart product is not in stock", async () => {
    const d = deps();
    d.cartRepo.validateClientLinesForCheckout = vi.fn().mockRejectedValue(
      new AppError("One or more products are unavailable. Please refresh your cart.", {
        statusCode: 400,
        code: "PRODUCT_UNAVAILABLE"
      })
    );
    const run = createCheckoutStorefront(d);
    await expect(run({}, checkoutInput())).rejects.toMatchObject({ code: "PRODUCT_UNAVAILABLE" });
  });

  it("returns existing order when idempotency key matches a completed checkout", async () => {
    const d = deps();
    d.orderRepo.findCheckoutIdempotencyOrderId = vi.fn().mockResolvedValue("order-existing");
    d.orderRepo.getOrderSummaryForCheckoutReplay = vi.fn().mockResolvedValue({
      id: "order-existing",
      order_number: "ORD-1",
      total_minor: "99"
    });
    const run = createCheckoutStorefront(d);
    const out = await run({}, checkoutInput({ idempotencyKey: "idem-key-12345678" }));
    expect(out).toMatchObject({ orderId: "order-existing", orderNumber: "ORD-1", total_minor: 99 });
    expect(d.cartRepo.validateClientLinesForCheckout).not.toHaveBeenCalled();
    expect(d.orderRepo.insertOrderWithItemsAndOutbox).not.toHaveBeenCalled();
  });

  it("creates order on valid checkout path", async () => {
    const d = deps();
    const run = createCheckoutStorefront(d);
    const out = await run({}, checkoutInput({ notes: "ring bell" }));

    expect(d.orderRepo.insertOrderWithItemsAndOutbox).toHaveBeenCalledTimes(1);
    expect(d.orderRepo.insertOrderWithItemsAndOutbox).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        customerName: "John",
        customerPhone: "+919999999999",
        customerAddress: "x"
      })
    );
    expect(d.cartRepo.deleteCartItemsForCart).toHaveBeenCalledWith(
      {},
      "00000000-0000-4000-8000-000000000001",
      "cart-1"
    );
    expect(d.cartRepo.deleteCart).toHaveBeenCalledWith(
      {},
      "00000000-0000-4000-8000-000000000001",
      "cart-1"
    );
    expect(out).toMatchObject({
      orderId: "order-1",
      total_minor: 120
    });
    expect(d.checkShopServiceArea).toHaveBeenCalledTimes(1);
    expect(d.orderRepo.insertCheckoutIdempotency).not.toHaveBeenCalled();
  });

  it("checkouts from client cart items without a stored cart", async () => {
    const d = deps();
    d.cartRepo.findCartByShopAndCustomerId = vi.fn().mockResolvedValue(null);
    d.cartRepo.validateClientLinesForCheckout = vi.fn().mockResolvedValue([
      {
        id: "client-line-1",
        product_id: "11111111-1111-4111-8111-111111111111",
        title_snapshot: "A",
        unit_label: "kg",
        quantity: "1",
        unit_price_minor: 100,
        is_custom: false,
        custom_note: null
      }
    ]);
    const run = createCheckoutStorefront(d);
    const out = await run(
      {},
      {
        shopId: "00000000-0000-4000-8000-000000000001",
        customerId: "cust-1",
        userId: "user-1",
        items: [{ productId: "11111111-1111-4111-8111-111111111111", quantity: 1 }]
      }
    );
    expect(out).toMatchObject({ orderId: "order-1", total_minor: 120 });
    expect(d.cartRepo.validateClientLinesForCheckout).toHaveBeenCalledTimes(1);
    expect(d.cartRepo.validateCartForCheckoutCommit).not.toHaveBeenCalled();
    // Session cart is looked up after order so Redis can be cleared even for client-line checkout.
    expect(d.cartRepo.findCartByShopAndCustomerId).toHaveBeenCalled();
    expect(d.cartRepo.deleteCart).not.toHaveBeenCalled();
    expect(d.orderRepo.insertCheckoutIdempotency).not.toHaveBeenCalled();
  });

  it("clears Redis session cart after client-line checkout when one exists", async () => {
    const d = deps();
    d.cartRepo.validateClientLinesForCheckout = vi.fn().mockResolvedValue([
      {
        id: "client-line-1",
        product_id: "11111111-1111-4111-8111-111111111111",
        title_snapshot: "A",
        unit_label: "kg",
        quantity: "1",
        unit_price_minor: 100,
        is_custom: false,
        custom_note: null
      }
    ]);
    const run = createCheckoutStorefront(d);
    await run(
      {},
      {
        shopId: "00000000-0000-4000-8000-000000000001",
        customerId: "cust-1",
        userId: "user-1",
        items: [{ productId: "11111111-1111-4111-8111-111111111111", quantity: 1 }]
      }
    );
    expect(d.cartRepo.deleteCartItemsForCart).toHaveBeenCalledWith(
      {},
      "00000000-0000-4000-8000-000000000001",
      "cart-1"
    );
    expect(d.cartRepo.deleteCart).toHaveBeenCalledWith(
      {},
      "00000000-0000-4000-8000-000000000001",
      "cart-1"
    );
  });

  it("records idempotency mapping when Idempotency-Key is provided", async () => {
    const d = deps();
    const run = createCheckoutStorefront(d);
    await run({}, checkoutInput({ idempotencyKey: "checkout-key-abcdefgh" }));
    expect(d.orderRepo.insertCheckoutIdempotency).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        idempotencyKey: "checkout-key-abcdefgh",
        orderId: "order-1",
        cartId: null
      })
    );
  });

  it("rejects idempotency keys outside 8–128 characters", async () => {
    const d = deps();
    const run = createCheckoutStorefront(d);
    await expect(
      run(
        {},
        {
          shopId: "00000000-0000-4000-8000-000000000001",
          customerId: "cust-1",
          userId: "user-1",
          idempotencyKey: "short"
        }
      )
    ).rejects.toMatchObject({ code: "INVALID_IDEMPOTENCY_KEY" });
  });

  it("rejects idempotency keys with control characters", async () => {
    const d = deps();
    const run = createCheckoutStorefront(d);
    await expect(
      run(
        {},
        {
          shopId: "00000000-0000-4000-8000-000000000001",
          customerId: "cust-1",
          userId: "user-1",
          idempotencyKey: "checkout\u0000badkey"
        }
      )
    ).rejects.toMatchObject({ code: "INVALID_IDEMPOTENCY_KEY" });
    expect(d.orderRepo.acquireCheckoutIdempotencyLock).not.toHaveBeenCalled();
  });

  it("emits standardized order.placed payload after successful checkout", async () => {
    const d = deps();
    const emitOrderPlaced = vi.fn();
    const run = createCheckoutStorefront({ ...d, emitOrderPlaced });
    await run({}, checkoutInput());
    expect(emitOrderPlaced).toHaveBeenCalledTimes(1);
    expect(emitOrderPlaced).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-1",
        shopId: "00000000-0000-4000-8000-000000000001",
        customerId: "cust-1",
        totalMinor: 120
      })
    );
  });

  it("persists bundle display quantity and promotion ids on order lines", async () => {
    const cartItemId = "cart-item-1";
    const productId = PRODUCT_ID;
    const d = deps();
    d.cartRepo.validateClientLinesForCheckout = vi.fn().mockResolvedValue([
      {
        id: cartItemId,
        product_id: productId,
        title_snapshot: "Banana",
        unit_label: "kg",
        quantity: "2",
        unit_price_minor: 5000,
        is_custom: false,
        custom_note: null
      }
    ]);
    d.priceStorefrontLines = vi.fn().mockResolvedValue({
      subtotalMinor: 9000,
      promotionDiscountTotalMinor: 4500,
      couponDiscountMinor: 0,
      appliedPromotionIds: ["promo-bogo"],
      lines: [
        {
          cartItemId,
          productId,
          quantity: 2,
          paid_quantity: 2,
          free_quantity: 1,
          display_quantity: 3,
          list_price_minor: "5000",
          total_price_minor: "5000",
          final_price_minor: "4500",
          line_total_minor: "9000",
          applied_promotion_ids: ["promo-bogo"]
        }
      ]
    });
    const run = createCheckoutStorefront(d);
    await run({}, checkoutInput({ items: [{ productId, quantity: 2 }] }));
    expect(d.orderRepo.insertOrderWithItemsAndOutbox).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        items: [
          expect.objectContaining({
            quantity: 3,
            paidQuantity: 2,
            freeQuantity: 1,
            appliedPromotionIds: ["promo-bogo"],
            lineTotalMinor: 9000
          })
        ],
        appliedPromotionIds: ["promo-bogo"],
        promotionDiscountTotalMinor: 4500
      })
    );
  });

  it("buy 1 get 1 stores display qty 2 (pack) and paidQuantity 1", async () => {
    const d = pricedDeps();
    const productId = "11111111-1111-4111-8111-111111111111";
    const cartItemId = "cart-item-1";
    d.cartRepo.validateClientLinesForCheckout = vi.fn().mockResolvedValue([
      {
        id: cartItemId,
        product_id: productId,
        quantity: "1",
        unit_price_minor: 5000,
        unit_size_snapshot: "1",
        title_snapshot: "Milk",
        unit_label: "pc",
        is_custom: false,
        custom_note: null
      }
    ]);
    d.priceStorefrontLines = vi.fn().mockResolvedValue({
      subtotalMinor: 5000,
      promotionDiscountTotalMinor: 5000,
      couponDiscountMinor: 0,
      appliedPromotionIds: ["promo-bogo"],
      lines: [
        {
          cartItemId,
          productId,
          quantity: 1,
          paid_quantity: 1,
          free_quantity: 1,
          display_quantity: 2,
          list_price_minor: "5000",
          total_price_minor: "5000",
          final_price_minor: "5000",
          line_total_minor: "5000",
          applied_promotion_ids: ["promo-bogo"]
        }
      ]
    });
    const run = createCheckoutStorefront(d);
    await run({}, checkoutInput({ items: [{ productId, quantity: 1 }] }));
    expect(d.orderRepo.insertOrderWithItemsAndOutbox).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        items: [
          expect.objectContaining({
            quantity: 2,
            paidQuantity: 1,
            freeQuantity: 1
          })
        ]
      })
    );
  });

  it("applies coupon via pricing engine and records redemption", async () => {
    const d = pricedDeps();
    const run = createCheckoutStorefront(d);
    const out = await run({}, checkoutInput({ couponCode: "SAVE10" }));
    expect(d.priceStorefrontLines).toHaveBeenCalled();
    expect(d.promotionRepo.insertPromotionRedemption).toHaveBeenCalled();
    expect(out).toMatchObject({
      subtotal_minor: 90,
      coupon_discount_minor: 10,
      total_minor: 110,
      coupon_code: "SAVE10"
    });
  });

  it("records automatic promotion redemptions after checkout", async () => {
    const d = pricedDeps();
    d.priceStorefrontLines = vi.fn().mockResolvedValue({
      subtotalMinor: 450,
      promotionDiscountTotalMinor: 50,
      couponDiscountMinor: 0,
      appliedPromotionIds: ["promo-sku"],
      appliedPromotionDiscounts: [{ promotionId: "promo-sku", discountMinor: 50 }],
      coupon: null,
      lines: [
        {
          cartItemId: "cart-item-1",
          productId: "11111111-1111-4111-8111-111111111111",
          quantity: 1,
          list_price_minor: "500",
          total_price_minor: "500",
          final_price_minor: "450",
          line_total_minor: "450",
          offer_discount_minor: "0",
          promo_discount_minor: "50",
          total_discount_minor: "50",
          applied_promotion_ids: ["promo-sku"]
        }
      ]
    });

    const run = createCheckoutStorefront(d);
    await run({}, checkoutInput());

    expect(d.promotionRepo.insertPromotionRedemption).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        promotionId: "promo-sku",
        couponId: null,
        discountMinor: 50
      })
    );
  });

  it("rejects checkout without client items", async () => {
    const d = deps();
    const run = createCheckoutStorefront({ ...d, priceStorefrontLines: vi.fn() });
    await expect(
      run(
        {},
        {
          shopId: "00000000-0000-4000-8000-000000000001",
          customerId: "cust-1",
          userId: "user-1",
          couponCode: "SAVE10"
        }
      )
    ).rejects.toMatchObject({ code: "CART_EMPTY" });
    expect(d.cartRepo.validateClientLinesForCheckout).not.toHaveBeenCalled();
  });

  it("does not fail checkout when realtime emit fails and writes retry outbox event", async () => {
    const d = deps();
    const emitOrderPlaced = vi.fn(() => {
      throw new Error("socket down");
    });
    const run = createCheckoutStorefront({ ...d, emitOrderPlaced });
    const out = await run({}, checkoutInput());
    expect(out.orderId).toBe("order-1");
    expect(d.orderRepo.insertOutboxEvent).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        shopId: "00000000-0000-4000-8000-000000000001",
        aggregateType: "order",
        aggregateId: "order-1",
        eventType: "ORDER_PLACED_REALTIME"
      })
    );
  });
});
