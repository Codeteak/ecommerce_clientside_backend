import { describe, it, expect } from "vitest";
import { mapStorefrontOrderRow } from "../../src/application/services/storefront/formatStorefrontOrderResponse.js";

describe("mapStorefrontOrderRow", () => {
  it("exposes coupon and promotion discount fields aligned with checkout", () => {
    const out = mapStorefrontOrderRow({
      id: "00000000-0000-0000-0000-0000000000a1",
      subtotal_minor: "7000",
      delivery_fee_minor: "500",
      total_minor: "7500",
      promotion_discount_total_minor: "3000",
      coupon_discount_minor: "1000",
      coupon_code_normalized: "SAVE10"
    });

    expect(out.subtotal_minor).toBe(7000);
    expect(out.promotion_discount_minor).toBe(3000);
    expect(out.coupon_discount_minor).toBe(1000);
    expect(out.auto_promotion_discount_minor).toBe(2000);
    expect(out.subtotal_before_coupon_minor).toBe(8000);
    expect(out.coupon_code).toBe("SAVE10");
  });

  it("defaults missing coupon discount to zero", () => {
    const out = mapStorefrontOrderRow({
      subtotal_minor: 5000,
      promotion_discount_total_minor: 500,
      coupon_code_normalized: null
    });

    expect(out.coupon_discount_minor).toBe(0);
    expect(out.auto_promotion_discount_minor).toBe(500);
    expect(out.coupon_code).toBeNull();
  });
});
