import { describe, it, expect } from "vitest";
import { formatShopResolveByDomain } from "../../src/application/services/shops/formatShopResolveByDomain.js";

describe("formatShopResolveByDomain", () => {
  it("returns null when row is missing", () => {
    expect(formatShopResolveByDomain(null)).toBeNull();
  });

  it("maps id, name, and public image URL", () => {
    const out = formatShopResolveByDomain({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Demo Shop",
      shop_image_storage_key: "shops/demo/logo.png"
    });
    expect(out?.shopId).toBe("11111111-1111-4111-8111-111111111111");
    expect(out?.shopName).toBe("Demo Shop");
    expect(out?.shopImage).toBe("https://storage.test/shops/demo/logo.png");
  });

  it("returns null shopImage when no storage key", () => {
    const out = formatShopResolveByDomain({
      id: "11111111-1111-4111-8111-111111111111",
      name: "No Logo Shop",
      shop_image_storage_key: null
    });
    expect(out?.shopImage).toBeNull();
  });
});
