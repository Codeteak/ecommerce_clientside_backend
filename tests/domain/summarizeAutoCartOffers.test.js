import { describe, expect, it } from "vitest";
import { summarizeAutoCartOffers } from "../../src/application/services/promotions/summarizeAutoCartOffers.js";

describe("summarizeAutoCartOffers", () => {
  it("marks applied category offers and suggests other categories", () => {
    const appliedByPromotion = new Map([["promo-dairy", 200]]);
    const out = summarizeAutoCartOffers({
      rules: [
        {
          promotion_id: "promo-dairy",
          rule_kind: "category_percent_off",
          percent_bps: 1000,
          global_category_id: "cat-dairy",
          category_name: "Dairy",
          promotion_name: "Dairy week"
        },
        {
          promotion_id: "promo-snacks",
          rule_kind: "category_percent_off",
          percent_bps: 1500,
          global_category_id: "cat-snacks",
          category_name: "Snacks",
          promotion_name: "Snack deal"
        }
      ],
      ctx: {
        subtotalMinor: 2000,
        lines: [{ lineTotalMinor: 2000, categoryId: "cat-dairy" }]
      },
      appliedByPromotion
    });

    expect(out.applied).toHaveLength(1);
    expect(out.applied[0].category_name).toBe("Dairy");
    expect(out.applied[0].title).toContain("Dairy");
    expect(out.applied[0].message).toMatch(/Dairy/i);
    expect(out.suggested).toHaveLength(1);
    expect(out.suggested[0].category_name).toBe("Snacks");
    expect(out.suggested[0].message).toMatch(/Snacks/i);
  });

  it("suggests threshold cart offers when subtotal is below minimum", () => {
    const out = summarizeAutoCartOffers({
      rules: [
        {
          promotion_id: "promo-cart",
          rule_kind: "cart_percent_off_if_subtotal_above",
          percent_bps: 500,
          min_subtotal_minor: 50000,
          promotion_name: "Spend more"
        }
      ],
      ctx: { subtotalMinor: 20000, lines: [] },
      appliedByPromotion: new Map()
    });

    expect(out.applied).toHaveLength(0);
    expect(out.suggested).toHaveLength(1);
    expect(out.suggested[0].status).toBe("min_subtotal");
    expect(out.suggested[0].remaining_minor).toBe(30000);
  });
});
