import { describe, expect, it } from "vitest";
import { buildCouponEligibility } from "../../src/application/services/promotions/couponEligibility.js";

describe("buildCouponEligibility", () => {
  const baseCtx = {
    deliveredCount: 0,
    customerCreatedAt: new Date("2025-01-15T00:00:00.000Z"),
    newCustomerCutoff: new Date("2025-01-01T00:00:00.000Z"),
    cartSubtotalMinor: 5000
  };

  it("returns applicable when no constraints", () => {
    expect(
      buildCouponEligibility(
        { minSubtotalMinor: null, firstOrderOnly: false, newCustomerOnly: false },
        baseCtx
      )
    ).toEqual({ applicable: true, ineligibilityCodes: [] });
  });

  it("flags first order only when delivered orders exist", () => {
    const r = buildCouponEligibility(
      { minSubtotalMinor: null, firstOrderOnly: true, newCustomerOnly: false },
      { ...baseCtx, deliveredCount: 1 }
    );
    expect(r.applicable).toBe(false);
    expect(r.ineligibilityCodes).toContain("FIRST_ORDER_ONLY_NOT_MET");
  });

  it("flags new customer only when account is older than cutoff", () => {
    const r = buildCouponEligibility(
      { minSubtotalMinor: null, firstOrderOnly: false, newCustomerOnly: true },
      {
        ...baseCtx,
        customerCreatedAt: new Date("2024-01-01T00:00:00.000Z"),
        newCustomerCutoff: new Date("2025-01-01T00:00:00.000Z")
      }
    );
    expect(r.applicable).toBe(false);
    expect(r.ineligibilityCodes).toContain("NEW_CUSTOMER_ONLY_NOT_MET");
  });

  it("flags min subtotal when cart missing", () => {
    const r = buildCouponEligibility(
      { minSubtotalMinor: 100, firstOrderOnly: false, newCustomerOnly: false },
      { ...baseCtx, cartSubtotalMinor: null }
    );
    expect(r.ineligibilityCodes).toContain("MIN_SUBTOTAL_NOT_MET");
  });

  it("flags min subtotal when cart below threshold", () => {
    const r = buildCouponEligibility(
      { minSubtotalMinor: 10_000, firstOrderOnly: false, newCustomerOnly: false },
      { ...baseCtx, cartSubtotalMinor: 5000 }
    );
    expect(r.ineligibilityCodes).toContain("MIN_SUBTOTAL_NOT_MET");
  });
});
