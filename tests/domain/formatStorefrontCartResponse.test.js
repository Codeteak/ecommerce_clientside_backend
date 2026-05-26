import { describe, it, expect } from "vitest";
import { formatStorefrontCartItem } from "../../src/application/services/storefront/formatStorefrontCartResponse.js";

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
