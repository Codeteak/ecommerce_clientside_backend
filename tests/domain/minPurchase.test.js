import { describe, it, expect } from "vitest";
import {
  remainingMinPurchaseMinor,
  assertMinPurchaseMet,
  minPurchaseUserMessage,
  MIN_PURCHASE_NOT_MET
} from "../../src/domain/ordering/minPurchase.js";

describe("minPurchase domain", () => {
  it("remaining is 0 when min is 0", () => {
    expect(remainingMinPurchaseMinor(0, 0)).toBe(0);
    expect(remainingMinPurchaseMinor(0, 50)).toBe(0);
  });

  it("remaining is 0 at exact min", () => {
    expect(remainingMinPurchaseMinor(20000, 20000)).toBe(0);
    expect(assertMinPurchaseMet({ minPurchaseMinor: 20000, subtotalMinor: 20000 })).toEqual({
      minPurchaseMinor: 20000,
      remainingMinor: 0
    });
  });

  it("remaining is 1 paise when 1 paise short", () => {
    expect(remainingMinPurchaseMinor(20000, 19999)).toBe(1);
    try {
      assertMinPurchaseMet({ minPurchaseMinor: 20000, subtotalMinor: 19999 });
      throw new Error("should throw");
    } catch (err) {
      expect(err).toMatchObject({
        code: MIN_PURCHASE_NOT_MET,
        statusCode: 400,
        details: {
          minPurchaseMinor: 20000,
          subtotalMinor: 19999,
          remainingMinor: 1
        }
      });
    }
  });

  it("callers pass goods subtotal so delivery is ignored", () => {
    const goods = 20000;
    const delivery = 5000;
    expect(remainingMinPurchaseMinor(20000, goods)).toBe(0);
    expect(remainingMinPurchaseMinor(20000, goods + delivery)).toBe(0);
    expect(assertMinPurchaseMet({ minPurchaseMinor: 20000, subtotalMinor: goods })).toEqual({
      minPurchaseMinor: 20000,
      remainingMinor: 0
    });
  });

  it("formats the user-facing remaining sentence", () => {
    expect(
      minPurchaseUserMessage({ minPurchaseMinor: 20000, remainingMinor: 150 })
    ).toBe("Add ₹1.50 more to meet this shop's ₹200 minimum order.");
  });
});
