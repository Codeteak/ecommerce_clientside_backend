import { describe, expect, it } from "vitest";
import { mapPublicPromotionBenefits } from "../../src/application/services/promotions/publicPromotionBenefits.js";

describe("mapPublicPromotionBenefits", () => {
  it("returns empty array for non-array input", () => {
    expect(mapPublicPromotionBenefits(null)).toEqual([]);
    expect(mapPublicPromotionBenefits({})).toEqual([]);
  });

  it("maps allowlisted kinds and drops unknown kinds", () => {
    expect(
      mapPublicPromotionBenefits([
        { kind: "cart_percent_off", percentBps: 1000, amountMinor: null },
        { kind: "malicious_kind", percentBps: 9999 },
        { kind: "cart_fixed_off", amountMinor: 500, percentBps: null }
      ])
    ).toEqual([
      { kind: "cart_percent_off", percentBps: 1000 },
      { kind: "cart_fixed_off", amountMinor: 500 }
    ]);
  });

  it("includes minSubtotalMinor when present", () => {
    expect(
      mapPublicPromotionBenefits([
        { kind: "cart_percent_off_if_subtotal_above", percentBps: 500, minSubtotalMinor: 2000 }
      ])
    ).toEqual([{ kind: "cart_percent_off_if_subtotal_above", percentBps: 500, minSubtotalMinor: 2000 }]);
  });
});
