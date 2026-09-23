import { describe, it, expect } from "vitest";
import {
  MAX_LINE_QUANTITY,
  normalizeCheckoutLineQuantity
} from "../../src/application/services/storefront/cart/cartLineRules.js";

describe("normalizeCheckoutLineQuantity", () => {
  it("accepts whole numbers for piece products", () => {
    expect(normalizeCheckoutLineQuantity(2, false)).toBe(2);
    expect(normalizeCheckoutLineQuantity(1, false)).toBe(1);
  });

  it("rejects fractional quantity for piece products", () => {
    expect(() => normalizeCheckoutLineQuantity(0.9, false)).toThrow(
      expect.objectContaining({ code: "INVALID_QUANTITY" })
    );
    expect(() => normalizeCheckoutLineQuantity(1.5, false)).toThrow(
      expect.objectContaining({ code: "INVALID_QUANTITY" })
    );
  });

  it("rejects zero or negative for piece products", () => {
    expect(() => normalizeCheckoutLineQuantity(0, false)).toThrow(
      expect.objectContaining({ code: "INVALID_QUANTITY" })
    );
    expect(() => normalizeCheckoutLineQuantity(-1, false)).toThrow(
      expect.objectContaining({ code: "INVALID_QUANTITY" })
    );
  });

  it("rejects quantity above line cap for piece products", () => {
    expect(() => normalizeCheckoutLineQuantity(MAX_LINE_QUANTITY + 1, false)).toThrow(
      expect.objectContaining({ code: "LINE_QUANTITY_CAP" })
    );
  });

  it("allows fractional kg for weight products", () => {
    expect(normalizeCheckoutLineQuantity(0.255, true)).toBe(0.255);
    expect(normalizeCheckoutLineQuantity(1.5, true)).toBe(1.5);
  });

  it("rejects non-positive weight quantity", () => {
    expect(() => normalizeCheckoutLineQuantity(0, true)).toThrow(
      expect.objectContaining({ code: "INVALID_QUANTITY" })
    );
  });
});
