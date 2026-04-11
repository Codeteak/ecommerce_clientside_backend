import { describe, it, expect, vi } from "vitest";
import { AppError } from "../../src/domain/errors/AppError.js";
import { createCheckoutStorefront } from "../../src/application/services/checkout/checkoutStorefront.js";

function deps() {
  return {
    cartRepo: {
      findCartByShopAndCustomerId: vi.fn().mockResolvedValue({ id: "cart-1" }),
      validateCartForCheckoutCommit: vi.fn().mockResolvedValue([
        {
          product_id: "11111111-1111-4111-8111-111111111111",
          title_snapshot: "A",
          unit_label: "kg",
          quantity: "1",
          unit_price_minor: 100,
          is_custom: false,
          custom_note: null
        }
      ]),
      getProductSnapshotForCart: vi.fn().mockResolvedValue({
        id: "11111111-1111-4111-8111-111111111111",
        name: "A",
        base_unit: "kg",
        price_minor_per_unit: 100,
        status: "active",
        availability: "in_stock"
      }),
      deleteCartItemsForCart: vi.fn().mockResolvedValue(undefined),
      deleteCart: vi.fn().mockResolvedValue(undefined)
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

describe("checkoutStorefront validations", () => {
  it("fails when customer phone is missing", async () => {
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
    await expect(
      run({}, {
        shopId: "00000000-0000-4000-8000-000000000001",
        customerId: "cust-1",
        userId: "user-1",
        addressId: "22222222-2222-4222-8222-222222222222"
      })
    ).rejects.toMatchObject({ code: "PHONE_REQUIRED" });
  });

  it("fails when selected address does not belong to customer", async () => {
    const d = deps();
    const run = createCheckoutStorefront(d);
    await expect(
      run({}, {
        shopId: "00000000-0000-4000-8000-000000000001",
        customerId: "cust-1",
        userId: "user-1",
        addressId: "33333333-3333-4333-8333-333333333333"
      })
    ).rejects.toMatchObject({ code: "ADDRESS_INVALID" });
  });

  it("fails when address is outside service area", async () => {
    const d = deps();
    d.checkShopServiceArea = vi.fn().mockResolvedValue({ inServiceArea: false });
    const run = createCheckoutStorefront(d);
    await expect(
      run({}, {
        shopId: "00000000-0000-4000-8000-000000000001",
        customerId: "cust-1",
        userId: "user-1",
        addressId: "22222222-2222-4222-8222-222222222222"
      })
    ).rejects.toMatchObject({ code: "ADDRESS_NOT_SERVICEABLE" });
  });

  it("fails when any cart product is not in stock", async () => {
    const d = deps();
    d.cartRepo.validateCartForCheckoutCommit = vi.fn().mockRejectedValue(
      new AppError("One or more products are unavailable. Please refresh your cart.", {
        statusCode: 400,
        code: "PRODUCT_UNAVAILABLE"
      })
    );
    const run = createCheckoutStorefront(d);
    await expect(
      run({}, {
        shopId: "00000000-0000-4000-8000-000000000001",
        customerId: "cust-1",
        userId: "user-1",
        addressId: "22222222-2222-4222-8222-222222222222"
      })
    ).rejects.toMatchObject({ code: "PRODUCT_UNAVAILABLE" });
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
    const out = await run(
      {},
      {
        shopId: "00000000-0000-4000-8000-000000000001",
        customerId: "cust-1",
        userId: "user-1",
        addressId: "22222222-2222-4222-8222-222222222222",
        idempotencyKey: "idem-key-12345678"
      }
    );
    expect(out).toEqual({ orderId: "order-existing", orderNumber: "ORD-1", total_minor: 99 });
    expect(d.cartRepo.validateCartForCheckoutCommit).not.toHaveBeenCalled();
    expect(d.orderRepo.insertOrderWithItemsAndOutbox).not.toHaveBeenCalled();
  });

  it("creates order on valid checkout path", async () => {
    const d = deps();
    const run = createCheckoutStorefront(d);
    const out = await run({}, {
      shopId: "00000000-0000-4000-8000-000000000001",
      customerId: "cust-1",
      userId: "user-1",
      addressId: "22222222-2222-4222-8222-222222222222",
      notes: "ring bell"
    });

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
    expect(d.orderRepo.insertCheckoutIdempotency).not.toHaveBeenCalled();
  });

  it("records idempotency mapping when Idempotency-Key is provided", async () => {
    const d = deps();
    const run = createCheckoutStorefront(d);
    await run(
      {},
      {
        shopId: "00000000-0000-4000-8000-000000000001",
        customerId: "cust-1",
        userId: "user-1",
        addressId: "22222222-2222-4222-8222-222222222222",
        idempotencyKey: "checkout-key-abcdefgh"
      }
    );
    expect(d.orderRepo.insertCheckoutIdempotency).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        idempotencyKey: "checkout-key-abcdefgh",
        orderId: "order-1"
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
          addressId: "22222222-2222-4222-8222-222222222222",
          idempotencyKey: "short"
        }
      )
    ).rejects.toMatchObject({ code: "INVALID_IDEMPOTENCY_KEY" });
  });

  it("emits standardized order.placed payload after successful checkout", async () => {
    const d = deps();
    const emitOrderPlaced = vi.fn();
    const run = createCheckoutStorefront({ ...d, emitOrderPlaced });
    await run(
      {},
      {
        shopId: "00000000-0000-4000-8000-000000000001",
        customerId: "cust-1",
        userId: "user-1",
        addressId: "22222222-2222-4222-8222-222222222222"
      }
    );
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

  it("does not fail checkout when realtime emit fails and writes retry outbox event", async () => {
    const d = deps();
    const emitOrderPlaced = vi.fn(() => {
      throw new Error("socket down");
    });
    const run = createCheckoutStorefront({ ...d, emitOrderPlaced });
    const out = await run(
      {},
      {
        shopId: "00000000-0000-4000-8000-000000000001",
        customerId: "cust-1",
        userId: "user-1",
        addressId: "22222222-2222-4222-8222-222222222222"
      }
    );
    expect(out.orderId).toBe("order-1");
    expect(d.orderRepo.insertOutboxEvent).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        shopId: "00000000-0000-4000-8000-000000000001",
        aggregateType: "order",
        aggregateId: "order-1",
        eventType: "order.placed.realtime.retry"
      })
    );
  });
});
