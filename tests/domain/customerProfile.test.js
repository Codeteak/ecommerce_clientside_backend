import { describe, expect, it } from "vitest";
import { buildProfileFromShops } from "../../src/application/services/auth/customerProfile.js";

describe("buildProfileFromShops", () => {
  const customer = { display_name: "Alex" };

  it("maps shop flags and null image when no storage key", () => {
    const shops = [
      {
        id: "s1",
        name: "Demo",
        slug: "demo",
        is_active: true,
        status: "active",
        shop_image_storage_key: null
      }
    ];
    const out = buildProfileFromShops(customer, shops);
    expect(out).toEqual([
      {
        name: "Alex",
        shopName: "Demo",
        shopId: "s1",
        shopSlug: "demo",
        isActive: true,
        status: "active",
        image: null
      }
    ]);
  });

  it("includes image object when storage key is set", () => {
    const shops = [
      {
        id: "s1",
        name: "Demo",
        slug: "demo",
        is_active: false,
        status: "blocked",
        shop_image_storage_key: "shops/demo/logo.png"
      }
    ];
    const out = buildProfileFromShops(customer, shops);
    expect(out[0].isActive).toBe(false);
    expect(out[0].status).toBe("blocked");
    expect(out[0].image).toMatchObject({
      storageKey: "shops/demo/logo.png"
    });
    expect(out[0].image?.url === null || typeof out[0].image?.url === "string").toBe(true);
  });
});
