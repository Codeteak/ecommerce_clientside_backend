import { describe, it, expect } from "vitest";
import { normalizeShopDomainInput } from "../../src/domain/shop/normalizeShopDomainInput.js";

describe("normalizeShopDomainInput", () => {
  it("strips https scheme and path", () => {
    expect(normalizeShopDomainInput("https://marketfresh.in")).toBe("marketfresh.in");
  });

  it("keeps plain hostnames", () => {
    expect(normalizeShopDomainInput("  MarketFresh.IN ")).toBe("marketfresh.in");
  });
});
