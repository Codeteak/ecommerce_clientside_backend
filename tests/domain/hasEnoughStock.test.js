import { describe, it, expect } from "vitest";
import { hasEnoughStock } from "../../src/application/services/storefront/cart/cartLineRules.js";

describe("hasEnoughStock", () => {
  it("treats null or blank stock as unlimited", () => {
    expect(hasEnoughStock(null, 5)).toBe(true);
    expect(hasEnoughStock("", 5)).toBe(true);
    expect(hasEnoughStock("  ", 5)).toBe(true);
  });

  it("allows when stock covers the ordered quantity", () => {
    expect(hasEnoughStock(10, 3)).toBe(true);
    expect(hasEnoughStock("2.5", 2.5)).toBe(true);
  });

  it("rejects when stock is below the ordered quantity", () => {
    expect(hasEnoughStock(2, 3)).toBe(false);
    expect(hasEnoughStock("1.0", 1.01)).toBe(false);
  });
});
