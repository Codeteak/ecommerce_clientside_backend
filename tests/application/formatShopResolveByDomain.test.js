import { describe, it, expect } from "vitest";
import { env } from "../../src/config/env.js";
import { formatShopResolveByDomain } from "../../src/application/services/shops/formatShopResolveByDomain.js";

describe("formatShopResolveByDomain", () => {
  it("returns null when row is missing", () => {
    expect(formatShopResolveByDomain(null)).toBeNull();
  });

  it("returns shop_id, shop_name, and shop_image only", () => {
    const out = formatShopResolveByDomain({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Demo Shop",
      shop_image_storage_key: "shops/demo/logo.png"
    });
    expect(out).toEqual({
      shop_id: "11111111-1111-4111-8111-111111111111",
      shop_name: "Demo Shop",
      shop_image: `${env.OBJECT_STORAGE_PUBLIC_BASE_URL.replace(/\/$/, "")}/shops/demo/logo.png`
    });
    expect(out).not.toHaveProperty("shopId");
    expect(out).not.toHaveProperty("shop_photo");
  });

  it("normalizes legacy cached shape with shopId only", () => {
    const out = formatShopResolveByDomain({
      shopId: "52299f14-e9db-4ffe-8cda-1b93fb9d081c",
      name: "Market Fresh"
    });
    expect(out?.shop_id).toBe("52299f14-e9db-4ffe-8cda-1b93fb9d081c");
    expect(out?.shop_name).toBe("Market Fresh");
  });

  it("returns null shop_image when no storage key", () => {
    const out = formatShopResolveByDomain({
      id: "11111111-1111-4111-8111-111111111111",
      name: "No Logo Shop",
      shop_image_storage_key: null
    });
    expect(out?.shop_image).toBeNull();
  });
});
