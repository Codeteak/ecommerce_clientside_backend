import { describe, expect, it } from "vitest";
import { evaluateAutoCartRules } from "../../src/application/services/promotions/evaluateAutoCartRules.js";

describe("evaluateAutoCartRules", () => {
  it("scales appliedByPromotion shares when combined discounts exceed subtotal", () => {
    const out = evaluateAutoCartRules(
      [
        {
          promotion_id: "promo-a",
          priority: 10,
          created_at: "2026-01-01T00:00:00Z",
          rule_kind: "cart_fixed_off",
          amount_minor: 700
        },
        {
          promotion_id: "promo-b",
          priority: 20,
          created_at: "2026-01-02T00:00:00Z",
          rule_kind: "cart_fixed_off",
          amount_minor: 500
        }
      ],
      { subtotalMinor: 1000, lines: [{ lineTotalMinor: 1000 }] },
      { allowCombineAutoCampaigns: true }
    );

    expect(out.autoCartDiscountMinor).toBe(1000);
    const a = out.appliedByPromotion.get("promo-a") ?? 0;
    const b = out.appliedByPromotion.get("promo-b") ?? 0;
    expect(a + b).toBe(1000);
    expect(a).toBe(Math.floor((700 * 1000) / 1200));
    expect(b).toBe(1000 - a);
  });

  it("caps a single winner to the payable subtotal", () => {
    const out = evaluateAutoCartRules(
      [
        {
          promotion_id: "promo-full",
          priority: 10,
          created_at: "2026-01-01T00:00:00Z",
          rule_kind: "cart_percent_off",
          percent_bps: 10000
        }
      ],
      { subtotalMinor: 800, lines: [{ lineTotalMinor: 800 }] },
      { allowCombineAutoCampaigns: true }
    );

    expect(out.autoCartDiscountMinor).toBe(800);
    expect(out.appliedByPromotion.get("promo-full")).toBe(800);
  });
});
