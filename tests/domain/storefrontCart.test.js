import { describe, it, expect, vi } from "vitest";
import { ValidationError } from "../../src/domain/errors/ValidationError.js";
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

  it("passes through item image payload from cart repository", async () => {
    const cartRepo = {
      findCartByShopAndCustomerId: vi.fn().mockResolvedValue({
        id: "11111111-1111-4111-8111-111111111111"
      }),
      insertCart: vi.fn(),
      listCartItems: vi.fn().mockResolvedValue([
        {
          id: "a",
          product_slug: "apple",
          quantity: "1",
          unit_price_minor: 100,
          offer_price_minor_per_unit: "90",
          image: { url: "  https://cdn.example.com/global/apple.jpg  " }
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
    expect(out.items[0].image).toEqual({ url: "  https://cdn.example.com/global/apple.jpg  " });
  });

  it("adds separate bundle-reward line instead of discounting paid quantity", async () => {
    const cartItemId = "33333333-3333-4333-8333-333333333333";
    const productId = "22222222-2222-4222-8222-222222222222";
    const cartRepo = {
      findCartByShopAndCustomerId: vi.fn().mockResolvedValue({
        id: "11111111-1111-4111-8111-111111111111"
      }),
      insertCart: vi.fn(),
      listCartItems: vi.fn().mockResolvedValue([
        {
          id: cartItemId,
          product_id: productId,
          title_snapshot: "Banana",
          quantity: "2",
          unit_price_minor: 5000,
          offer_price_minor_per_unit: "4500",
          is_custom: false
        }
      ])
    };
    const priceStorefrontLines = vi.fn().mockResolvedValue({
      subtotalMinor: 9000,
      promotionDiscountTotalMinor: 4500,
      linePromoDiscountMinor: 0,
      lines: [
        {
          cartItemId,
          paid_quantity: 2,
          free_quantity: 1,
          display_quantity: 3,
          list_price_minor: "5000",
          final_price_minor: "4500",
          line_total_minor: "9000",
          offer_discount_minor: "0",
          promo_discount_minor: "0",
          total_discount_minor: "0",
          applied_promotion_ids: ["promo-bogo"]
        }
      ]
    });

    const service = createStorefrontCart({
      cartRepo,
      ensureShopForCatalog: vi.fn().mockResolvedValue(undefined),
      priceStorefrontLines
    });

    const out = await service.getCartContents({}, "00000000-0000-4000-8000-000000000001", {
      customerId: "cust-1"
    });

    expect(out.items).toHaveLength(2);
    expect(out.items[0]).toMatchObject({
      id: cartItemId,
      quantity: "2",
      is_bundle_reward: false,
      line_total_minor: "9000",
      final_price_minor: "4500"
    });
    expect(out.items[1]).toMatchObject({
      id: `${cartItemId}:bundle-reward`,
      quantity: "1",
      is_bundle_reward: true,
      bundle_source_cart_item_id: cartItemId,
      line_total_minor: "0",
      final_price_minor: "0"
    });
    expect(out.summary.display_units_total).toBe(3);
    expect(out.summary.subtotal_minor).toBe(9000);
  });

  it("rejects PATCH on synthetic bundle-reward cart item ids", async () => {
    const cartRepo = {
      findCartByShopAndCustomerId: vi.fn().mockResolvedValue({
        id: "11111111-1111-4111-8111-111111111111"
      }),
      findCartItemWithCart: vi.fn()
    };
    const service = createStorefrontCart({
      cartRepo,
      ensureShopForCatalog: vi.fn().mockResolvedValue(undefined)
    });
    await expect(
      service.updateItemQuantity(
        {},
        "00000000-0000-4000-8000-000000000001",
        { customerId: "cust-1" },
        "33333333-3333-4333-8333-333333333333:bundle-reward",
        1
      )
    ).rejects.toBeInstanceOf(ValidationError);
    expect(cartRepo.findCartItemWithCart).not.toHaveBeenCalled();
  });
});
