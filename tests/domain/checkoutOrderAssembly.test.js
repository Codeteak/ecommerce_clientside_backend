import { describe, it, expect, vi } from "vitest";
import {
  buildCheckoutOrderLines,
  collapseWeightStepOrderItem
} from "../../src/application/services/checkout/checkoutOrderAssembly.js";

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

  it("writes a 250 g step as 0.25 kg with unit size 1 and the per-kg price", async () => {
    const { orderItems } = await buildCheckoutOrderLines({
      cartRepo: null,
      client: null,
      shopId: "shop",
      custKey: "cust",
      items: [
        {
          id: "line-1",
          product_id: "apple",
          title_snapshot: "Apple",
          unit_label: "kg",
          unit_size_snapshot: "0.25",
          quantity: "2",
          unit_price_minor: 10000,
          is_custom: false,
          custom_note: null
        }
      ],
      couponCode: null,
      priceStorefrontLines: null
    });

    expect(orderItems[0].quantity).toBe(0.5);
    expect(orderItems[0].paidQuantity).toBe(0.5);
    expect(orderItems[0].unitLabel).toBe("kg");
    expect(orderItems[0].unitSizeSnapshot).toBe("1");
    expect(orderItems[0].unitPriceMinor).toBe(10000);
    expect(orderItems[0].lineTotalMinor).toBe(5000);
  });
});

describe("collapseWeightStepOrderItem", () => {
  it("keeps an already priced 250 g line and does not double the step", () => {
    const item = collapseWeightStepOrderItem({
      isCustom: false,
      freeQuantity: 0,
      unitLabel: "kg",
      unitSizeSnapshot: "0.25",
      quantity: 1,
      paidQuantity: 1,
      unitPriceMinor: 10000,
      listPriceMinor: 10000,
      lineTotalMinor: 2500
    });
    expect(item.quantity).toBe(0.25);
    expect(item.unitSizeSnapshot).toBe("1");
    expect(item.unitPriceMinor).toBe(10000);
    expect(item.lineTotalMinor).toBe(2500);
  });
});

describe("buildCheckoutOrderLines cross BXGY inject names", () => {
  it("loads reward names with base_unit and keeps the checkout txn usable", async () => {
    const queries = [];
    const client = {
      query: vi.fn(async (sql) => {
        const text = String(sql);
        queries.push(text);
        if (
          text.startsWith("SAVEPOINT") ||
          text.startsWith("RELEASE") ||
          text.startsWith("ROLLBACK")
        ) {
          return { rows: [] };
        }
        if (text.includes("base_unit")) {
          return {
            rows: [{ id: "reward-1", name: "Free Chips", unit_label: "pcs" }]
          };
        }
        throw Object.assign(new Error('column "unit_label" does not exist'), {
          code: "42703"
        });
      })
    };

    const priceStorefrontLines = async () => ({
      subtotalMinor: 100,
      promotionDiscountTotalMinor: 50,
      couponDiscountMinor: 0,
      couponCodeNormalized: null,
      couponCodesNormalized: [],
      appliedPromotionIds: ["promo-1"],
      lines: [
        {
          cartItemId: "paid-1",
          productId: "buy-1",
          quantity: 1,
          paid_quantity: 1,
          free_quantity: 0,
          display_quantity: 1,
          final_price_minor: 100,
          line_total_minor: 100,
          list_price_minor: 100,
          total_price_minor: 100,
          applied_promotion_ids: ["promo-1"]
        },
        {
          cartItemId: "inject:reward-1",
          productId: "reward-1",
          quantity: 1,
          paid_quantity: 0,
          free_quantity: 1,
          display_quantity: 1,
          final_price_minor: 0,
          line_total_minor: 0,
          list_price_minor: 50,
          total_price_minor: 50,
          applied_promotion_ids: ["promo-1"]
        }
      ]
    });

    const { orderItems } = await buildCheckoutOrderLines({
      cartRepo: {
        listLiveProductPricingByIds: async () => [
          {
            id: "buy-1",
            price_minor_per_unit: 100,
            offer_price_minor_per_unit: null,
            global_category_id: null
          }
        ]
      },
      client,
      shopId: "shop",
      custKey: "cust",
      items: [
        {
          id: "paid-1",
          product_id: "buy-1",
          title_snapshot: "Buy Item",
          unit_label: "pcs",
          quantity: "1",
          unit_price_minor: 100,
          is_custom: false,
          custom_note: null
        }
      ],
      couponCode: null,
      priceStorefrontLines
    });

    expect(orderItems.some((it) => String(it.productId) === "reward-1")).toBe(true);
    const reward = orderItems.find((it) => String(it.productId) === "reward-1");
    expect(reward.name).toBe("Free Chips");
    expect(reward.unitLabel).toBe("pcs");
    expect(queries.some((q) => q.includes("base_unit"))).toBe(true);
    expect(queries.some((q) => q.includes("sp.unit_label"))).toBe(false);
  });
});
