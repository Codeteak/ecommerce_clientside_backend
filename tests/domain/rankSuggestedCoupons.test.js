import { describe, expect, it } from "vitest";
import { rankSuggestedCouponsByDiscount } from "../../src/application/services/promotions/rankSuggestedCoupons.js";

describe("rankSuggestedCouponsByDiscount", () => {
  it("orders by estimated discount descending and takes top 3", () => {
    const ranked = rankSuggestedCouponsByDiscount(
      [
        {
          code: "SMALL",
          eligibility: { applicable: true },
          benefits: [{ kind: "cart_fixed_off", amountMinor: 10 }]
        },
        {
          code: "BIG",
          eligibility: { applicable: true },
          benefits: [{ kind: "cart_percent_off", percentBps: 2000 }]
        },
        {
          code: "MID",
          eligibility: { applicable: true },
          benefits: [{ kind: "cart_fixed_off", amountMinor: 50 }]
        },
        {
          code: "HUGE",
          eligibility: { applicable: true },
          benefits: [{ kind: "cart_fixed_off", amountMinor: 500 }]
        }
      ],
      { subtotalMinor: 1000, lines: [] },
      3
    );
    expect(ranked.map((c) => c.code)).toEqual(["HUGE", "BIG", "MID"]);
  });
});
