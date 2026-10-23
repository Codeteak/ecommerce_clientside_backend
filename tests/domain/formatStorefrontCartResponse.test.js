import { describe, it, expect } from "vitest";
import {
  formatStorefrontCartItem,
  formatStorefrontSummary
} from "../../src/application/services/storefront/formatStorefrontCartResponse.js";

describe("formatStorefrontCartItem", () => {
  it("includes unit_size from cart line snapshot", () => {
    const item = formatStorefrontCartItem(
      {
        id: "item-1",
        product_id: "prod-1",
        title_snapshot: "Rice",
        unit_label: "kg",
        unit_size_snapshot: "5",
        quantity: "1",
        unit_price_minor: 100
      },
      undefined
    );

    expect(item.unit).toBe("kg");
    expect(item.unit_size).toBe("5");
  });

  it("defaults unit_size to 1 when snapshot is missing", () => {
    const item = formatStorefrontCartItem(
      {
        id: "item-1",
        title_snapshot: "Custom",
        unit_label: "each",
        quantity: "1",
        unit_price_minor: 10
      },
      undefined
    );

    expect(item.unit_size).toBe("1");
  });
});

describe("formatStorefrontSummary min purchase", () => {
  it("includes min and remaining, treating remaining 0 as present", () => {
    const summary = formatStorefrontSummary(
      { subtotalMinor: 20000, promotionDiscountTotalMinor: 0, couponDiscountMinor: 0 },
      1,
      { minPurchaseMinor: 20000 }
    );
    expect(summary.min_purchase_minor).toBe(20000);
    expect(summary.min_purchase_remaining_minor).toBe(0);
  });

  it("computes remaining from payable subtotal", () => {
    const summary = formatStorefrontSummary(
      { subtotalMinor: 15000, promotionDiscountTotalMinor: 0, couponDiscountMinor: 0 },
      1,
      { minPurchaseMinor: 20000 }
    );
    expect(summary.min_purchase_remaining_minor).toBe(5000);
  });
});
