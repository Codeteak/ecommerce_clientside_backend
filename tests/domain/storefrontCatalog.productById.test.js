import { describe, it, expect, vi } from "vitest";
import { createStorefrontCatalog } from "../../src/application/services/storefront/storefrontCatalog.js";
import { storefrontCatalogTestDeps } from "../helpers/storefrontCatalogTestDeps.js";

describe("storefrontCatalog getProductById", () => {
  it("maps product detail by shop product UUID", async () => {
    const catalogRepo = {
      getProductByIdStorefront: vi.fn().mockResolvedValue({
        product: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Apple",
          slug: "apple",
          base_unit: "kg",
          price_minor_per_unit: "100",
          offer_price_minor_per_unit: "90",
          availability: "in_stock",
          category_id: "22222222-2222-4222-8222-222222222222"
        },
        gallery: [
          {
            media_asset_id: "33333333-3333-4333-8333-333333333333",
            sort_order: 1,
            storage_key: "products/apple.jpg",
            content_type: "image/jpeg"
          }
        ]
      })
    };
    const storefrontCatalog = createStorefrontCatalog({
      catalogRepo,
      ensureShopForCatalog: vi.fn().mockResolvedValue(undefined),
      catalogCache: { swr: vi.fn((_k, _t, fn) => fn()) },
      catalogCacheTtlSec: 0,
      ...storefrontCatalogTestDeps()
    });

    const out = await storefrontCatalog.getProductById(
      "00000000-0000-4000-8000-000000000001",
      "11111111-1111-4111-8111-111111111111"
    );

    expect(catalogRepo.getProductByIdStorefront).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      "11111111-1111-4111-8111-111111111111"
    );
    expect(out).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      slug: "apple",
      category_id: "22222222-2222-4222-8222-222222222222",
      actual_price_minor: "100",
      offer_price_minor: "90",
      promo_price_minor: null,
      total_price_minor: "100",
      final_price_minor: "90",
      offer_discount_minor: "10",
      promo_discount_minor: "0",
      total_discount_minor: "10",
      bundle_rules: []
    });
    expect(out.images).toHaveLength(1);
  });

  it("falls back to global image_url and omits null image metadata", async () => {
    const catalogRepo = {
      getProductByIdStorefront: vi.fn().mockResolvedValue({
        product: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Apple",
          slug: "apple",
          base_unit: "kg",
          price_minor_per_unit: "100",
          offer_price_minor_per_unit: "90",
          availability: "in_stock",
          category_id: "22222222-2222-4222-8222-222222222222",
          global_image_url: "https://cdn.example.com/global/apple.jpg"
        },
        gallery: []
      })
    };
    const storefrontCatalog = createStorefrontCatalog({
      catalogRepo,
      ensureShopForCatalog: vi.fn().mockResolvedValue(undefined),
      catalogCache: { swr: vi.fn((_k, _t, fn) => fn()) },
      catalogCacheTtlSec: 0,
      ...storefrontCatalogTestDeps()
    });

    const out = await storefrontCatalog.getProductById(
      "00000000-0000-4000-8000-000000000001",
      "11111111-1111-4111-8111-111111111111"
    );

    expect(out.images).toHaveLength(1);
    expect(out.images[0].url).toBe("https://cdn.example.com/global/apple.jpg");
    expect(out.images[0]).not.toHaveProperty("mediaAssetId");
    expect(out.images[0]).not.toHaveProperty("storageKey");
  });

  it("prefers global image_url over gallery and preserves exact whitespace", async () => {
    const catalogRepo = {
      getProductByIdStorefront: vi.fn().mockResolvedValue({
        product: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Apple",
          slug: "apple",
          base_unit: "kg",
          price_minor_per_unit: "100",
          offer_price_minor_per_unit: "90",
          availability: "in_stock",
          category_id: "22222222-2222-4222-8222-222222222222",
          global_image_url: "  https://cdn.example.com/global/apple.jpg  "
        },
        gallery: [
          {
            media_asset_id: "33333333-3333-4333-8333-333333333333",
            sort_order: 1,
            storage_key: "products/apple.jpg",
            content_type: "image/jpeg"
          }
        ]
      })
    };
    const storefrontCatalog = createStorefrontCatalog({
      catalogRepo,
      ensureShopForCatalog: vi.fn().mockResolvedValue(undefined),
      catalogCache: { swr: vi.fn((_k, _t, fn) => fn()) },
      catalogCacheTtlSec: 0,
      ...storefrontCatalogTestDeps()
    });

    const out = await storefrontCatalog.getProductById(
      "00000000-0000-4000-8000-000000000001",
      "11111111-1111-4111-8111-111111111111"
    );

    expect(out.images).toEqual([
      {
        sortOrder: 0,
        contentType: null,
        url: "  https://cdn.example.com/global/apple.jpg  "
      }
    ]);
  });

  it("uses configured storefront catalog cache TTL for product detail", async () => {
    const catalogRepo = {
      getProductByIdStorefront: vi.fn().mockResolvedValue({
        product: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Apple",
          slug: "apple",
          base_unit: "kg",
          price_minor_per_unit: "100",
          offer_price_minor_per_unit: null,
          availability: "in_stock",
          category_id: "22222222-2222-4222-8222-222222222222"
        },
        gallery: []
      })
    };
    const swr = vi.fn((_k, t, fn) => {
      expect(t).toBe(60);
      return fn();
    });
    const storefrontCatalog = createStorefrontCatalog({
      catalogRepo,
      ensureShopForCatalog: vi.fn().mockResolvedValue(undefined),
      catalogCache: { swr },
      catalogCacheTtlSec: 60,
      ...storefrontCatalogTestDeps()
    });

    await storefrontCatalog.getProductById(
      "00000000-0000-4000-8000-000000000001",
      "11111111-1111-4111-8111-111111111111"
    );

    expect(swr).toHaveBeenCalledTimes(1);
  });
});
