import { describe, it, expect, vi } from "vitest";
import { createCheckoutStorefront } from "../../src/application/services/checkout/checkoutStorefront.js";

function deps() {
  return {
    cartRepo: {
      findCartByShopAndCustomerId: vi.fn().mockResolvedValue({ id: "cart-1" }),
      listCartItems: vi.fn().mockResolvedValue([
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
      listCartProductAvailability: vi.fn().mockResolvedValue([
        {
          cart_item_id: "ci-1",
          product_id: "11111111-1111-4111-8111-111111111111",
          product_status: "active",
          availability: "in_stock"
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
      insertOrderWithItemsAndOutbox: vi.fn().mockResolvedValue({ id: "order-1" })
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
    d.cartRepo.listCartProductAvailability = vi.fn().mockResolvedValue([{
      cart_item_id: "ci-1",
      product_id: "11111111-1111-4111-8111-111111111111",
      product_status: "active",
      availability: "out_of_stock"
    }]);
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
  });
});
