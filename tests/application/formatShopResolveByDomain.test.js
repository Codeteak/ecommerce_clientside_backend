import { describe, it, expect } from "vitest";
import { env } from "../../src/config/env.js";
import { formatShopResolveByDomain } from "../../src/application/services/shops/formatShopResolveByDomain.js";

const base = env.OBJECT_STORAGE_PUBLIC_BASE_URL.replace(/\/$/, "");

describe("formatShopResolveByDomain", () => {
  it("returns null when row is missing", () => {
    expect(formatShopResolveByDomain(null)).toBeNull();
  });

  it("returns shop_id, shop_name, shop_image, banner_enabled, and banner_images", () => {
    const out = formatShopResolveByDomain({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Demo Shop",
      shop_image_storage_key: "shops/demo/logo.png",
      banner_enabled: true,
      banner_storage_keys: ["banners/hero.jpg", "banners/side.jpg"]
    });
    expect(out).toEqual({
      shop_id: "11111111-1111-4111-8111-111111111111",
      shop_name: "Demo Shop",
      shop_image: `${base}/shops/demo/logo.png`,
      banner_enabled: true,
      banner_images: [`${base}/banners/hero.jpg`, `${base}/banners/side.jpg`]
    });
    expect(out).not.toHaveProperty("shopId");
    expect(out).not.toHaveProperty("shop_photo");
  });

  it("returns empty banner_images when banner_enabled is false", () => {
    const out = formatShopResolveByDomain({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Demo Shop",
      banner_enabled: false,
      banner_storage_keys: ["banners/hero.jpg"]
    });
    expect(out?.banner_enabled).toBe(false);
    expect(out?.banner_images).toEqual([]);
  });

  it("skips empty storage keys in banner_images", () => {
    const out = formatShopResolveByDomain({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Demo Shop",
      banner_enabled: true,
      banner_storage_keys: ["banners/a.jpg", "", "   ", "banners/b.jpg"]
    });
    expect(out?.banner_images).toEqual([`${base}/banners/a.jpg`, `${base}/banners/b.jpg`]);
  });

  it("defaults banner_enabled true and empty banner_images when omitted", () => {
    const out = formatShopResolveByDomain({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Demo Shop",
      shop_image_storage_key: null
    });
    expect(out?.banner_enabled).toBe(true);
    expect(out?.banner_images).toEqual([]);
  });

  it("normalizes legacy cached shape with shopId only", () => {
    const out = formatShopResolveByDomain({
      shopId: "52299f14-e9db-4ffe-8cda-1b93fb9d081c",
      name: "Market Fresh"
    });
    expect(out?.shop_id).toBe("52299f14-e9db-4ffe-8cda-1b93fb9d081c");
    expect(out?.shop_name).toBe("Market Fresh");
    expect(out?.banner_enabled).toBe(true);
    expect(out?.banner_images).toEqual([]);
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
