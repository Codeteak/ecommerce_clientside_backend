import { describe, expect, it } from "vitest";
import {
  evaluateCartPromotionRules,
  evaluateSinglePromotionRule
} from "../../src/application/services/promotions/evaluatePromotionRules.js";

describe("evaluatePromotionRules", () => {
  it("applies cart percent off with max cap", () => {
    const d = evaluateSinglePromotionRule(
      { rule_kind: "cart_percent_off", percent_bps: 1000, max_discount_minor: 50 },
      { subtotalMinor: 1000, lines: [] }
    );
    expect(d).toBe(50);
  });

  it("applies fixed off when subtotal threshold met", () => {
    const d = evaluateSinglePromotionRule(
      {
        rule_kind: "cart_fixed_off_if_subtotal_above",
        amount_minor: 200,
        min_subtotal_minor: 500
      },
      { subtotalMinor: 600, lines: [] }
    );
    expect(d).toBe(200);
  });

  it("sums multiple rules", () => {
    const total = evaluateCartPromotionRules(
      [
        { rule_kind: "cart_percent_off", percent_bps: 500 },
        { rule_kind: "cart_fixed_off", amount_minor: 100 }
      ],
      { subtotalMinor: 1000, lines: [] }
    );
    expect(total).toBe(150);
  });
});
