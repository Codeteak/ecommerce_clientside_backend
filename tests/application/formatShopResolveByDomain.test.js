import { describe, it, expect } from "vitest";
import { env } from "../../src/config/env.js";
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
    expect(out?.shop_name).toBe("Demo Shop");
    const expectedImage = `${env.OBJECT_STORAGE_PUBLIC_BASE_URL.replace(/\/$/, "")}/shops/demo/logo.png`;
    expect(out?.shopImage).toBe(expectedImage);
    expect(out?.shop_image).toBe(expectedImage);
    expect(out?.shop_photo).toBe(expectedImage);
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
