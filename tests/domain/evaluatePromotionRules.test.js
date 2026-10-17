import { describe, expect, it } from "vitest";
import {
  evaluateCartPromotionRules,
  evaluateSinglePromotionRule,
  scaleLinesToPayable
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

  it("scales category lines down to the cart left after an automatic discount", () => {
    const scaled = scaleLinesToPayable(
      [
        { lineTotalMinor: 800, categoryId: "cat" },
        { lineTotalMinor: 200, categoryId: "other" }
      ],
      900
    );
    expect(scaled.reduce((s, l) => s + l.lineTotalMinor, 0)).toBe(900);
    const d = evaluateSinglePromotionRule(
      { rule_kind: "category_percent_off", percent_bps: 1000, global_category_id: "cat" },
      { subtotalMinor: 900, lines: scaled }
    );
    expect(d).toBe(72);
  });

  it("matches leaf products when the rule targets a parent aisle", () => {
    const d = evaluateSinglePromotionRule(
      { rule_kind: "category_percent_off", percent_bps: 1000, global_category_id: "biscuits" },
      {
        subtotalMinor: 1000,
        categoryParentById: new Map([
          ["ghee", "dairy"],
          ["dairy", null],
          ["cream-biscuit", "biscuits"],
          ["biscuits", null]
        ]),
        lines: [
          { lineTotalMinor: 600, categoryId: "cream-biscuit" },
          { lineTotalMinor: 400, categoryId: "ghee" }
        ]
      }
    );
    expect(d).toBe(60);
  });
});
