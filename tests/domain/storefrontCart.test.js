import { describe, it, expect, vi } from "vitest";
import { createStorefrontCart } from "../../src/application/services/storefront/storefrontCart.js";

describe("storefront cart addItem merge behavior", () => {
  it("increments quantity when same product is added again", async () => {
    const cartRepo = {
      findCartByShopAndCustomerId: vi.fn().mockResolvedValue({
        id: "11111111-1111-4111-8111-111111111111"
      }),
      insertCart: vi.fn(),
      listCartItems: vi.fn(),
      getProductSnapshotForCart: vi.fn().mockResolvedValue({
        id: "22222222-2222-4222-8222-222222222222",
        name: "Apple",
        base_unit: "kg",
        price_minor_per_unit: 120
      }),
      findMatchingCartItem: vi.fn().mockResolvedValue({
        id: "33333333-3333-4333-8333-333333333333",
        quantity: "2"
      }),
      updateCartItemQuantity: vi.fn().mockResolvedValue({
        id: "33333333-3333-4333-8333-333333333333",
        quantity: "5"
      }),
      insertCartItem: vi.fn()
    };

    const service = createStorefrontCart({
      cartRepo,
      ensureShopForCatalog: vi.fn().mockResolvedValue(undefined)
    });

    const out = await service.addItem({}, "00000000-0000-4000-8000-000000000001", { customerId: "cust-1" }, {
      productId: "22222222-2222-4222-8222-222222222222",
      quantity: 3
    });

    expect(cartRepo.findMatchingCartItem).toHaveBeenCalled();
    expect(cartRepo.updateCartItemQuantity).toHaveBeenCalledWith(
      {},
      "00000000-0000-4000-8000-000000000001",
      "33333333-3333-4333-8333-333333333333",
      5
    );
    expect(cartRepo.insertCartItem).not.toHaveBeenCalled();
    expect(out.quantity).toBe("5");
  });

  it("returns total and offer totals in cart summary", async () => {
    const cartRepo = {
      findCartByShopAndCustomerId: vi.fn().mockResolvedValue({
        id: "11111111-1111-4111-8111-111111111111"
      }),
      insertCart: vi.fn(),
      listCartItems: vi.fn().mockResolvedValue([
        {
          id: "a",
          product_slug: "apple",
          quantity: "2",
          unit_price_minor: 100,
          offer_price_minor_per_unit: "80"
        },
        {
          id: "b",
          product_slug: "banana",
          quantity: "1",
          unit_price_minor: 50,
          offer_price_minor_per_unit: null
        }
      ])
    };

    const service = createStorefrontCart({
      cartRepo,
      ensureShopForCatalog: vi.fn().mockResolvedValue(undefined)
    });

    const out = await service.getCartContents({}, "00000000-0000-4000-8000-000000000001", {
      customerId: "cust-1"
    });

    expect(out.summary).toEqual({
      total_price_minor: 250,
      total_offer_price_minor: 210,
      total_discount_minor: 40,
      currency: "INR"
    });
    expect(out.items.map((it) => it.product_slug)).toEqual(["apple", "banana"]);
  });
});
