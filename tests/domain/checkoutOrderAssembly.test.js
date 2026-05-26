import { describe, it, expect } from "vitest";
import { buildCheckoutOrderLines } from "../../src/application/services/checkout/checkoutOrderAssembly.js";

describe("buildCheckoutOrderLines unit_size snapshot", () => {
  it("copies unit_size_snapshot from cart lines into order items", async () => {
    const items = [
      {
        id: "line-1",
        product_id: "prod-1",
        title_snapshot: "Milk",
        unit_label: "L",
        unit_size_snapshot: "0.5",
        quantity: "2",
        unit_price_minor: 100,
        is_custom: false,
        custom_note: null
      }
    ];

    const { orderItems } = await buildCheckoutOrderLines({
      cartRepo: null,
      client: null,
      shopId: "shop",
      custKey: "cust",
      items,
      couponCode: null,
      priceStorefrontLines: null
    });

    expect(orderItems).toHaveLength(1);
    expect(orderItems[0].unitSizeSnapshot).toBe("0.5");
    expect(orderItems[0].lineTotalMinor).toBe(200);
  });

  it("defaults unit_size_snapshot to 1 when missing", async () => {
    const { orderItems } = await buildCheckoutOrderLines({
      cartRepo: null,
      client: null,
      shopId: "shop",
      custKey: "cust",
      items: [
        {
          id: "line-1",
          product_id: "prod-1",
          title_snapshot: "Sugar",
          unit_label: "kg",
          quantity: "1",
          unit_price_minor: 50,
          is_custom: false,
          custom_note: null
        }
      ],
      couponCode: null,
      priceStorefrontLines: null
    });

    expect(orderItems[0].unitSizeSnapshot).toBe("1");
  });
});
