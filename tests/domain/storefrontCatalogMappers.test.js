import { describe, it, expect } from "vitest";
import {
  mapStorefrontCategoryRow,
  mapStorefrontProductRow
} from "../../src/application/services/storefront/storefrontCatalogMappers.js";

describe("storefrontCatalogMappers", () => {
  it("maps category row with nullable image", () => {
    const out = mapStorefrontCategoryRow({
      id: "c1",
      name: "Dairy",
      slug: "dairy",
      parent_id: null,
      sort_order: 0,
      image_storage_key: null
    });
    expect(out.image).toBeNull();
    expect(out.slug).toBe("dairy");
  });

  it("maps product row images and category fields", () => {
    const out = mapStorefrontProductRow({
      id: "p1",
      name: "Milk",
      slug: "milk",
      price_minor_per_unit: "100",
      offer_price_minor_per_unit: "90",
      availability: "in_stock",
      base_unit: "L",
      thumb_media_id: "m1",
      thumb_storage_key: "products/milk.jpg",
      thumb_content_type: "image/jpeg",
      product_images: JSON.stringify([
        {
          media_asset_id: "m1",
          sort_order: 0,
          storage_key: "products/milk.jpg",
          content_type: "image/jpeg"
        }
      ]),
      category_slug: "dairy",
      category_parent_id: null,
      category_name: "Dairy",
      category_image_media_id: null,
      category_image_storage_key: null,
      category_image_content_type: null,
      created_at: "2026-01-01T00:00:00.000Z",
      category_id: "c1"
    });

    expect(out.images).toHaveLength(1);
    expect(out.category?.name).toBe("Dairy");
  });

  it("falls back to global image_url when gallery assets are missing", () => {
    const out = mapStorefrontProductRow({
      id: "p2",
      name: "Curd",
      slug: "curd",
      price_minor_per_unit: "120",
      offer_price_minor_per_unit: "110",
      availability: "in_stock",
      base_unit: "kg",
      thumb_media_id: null,
      thumb_storage_key: null,
      thumb_content_type: null,
      product_images: "[]",
      global_image_url: "https://cdn.example.com/global/curd.jpg",
      category_slug: null,
      category_parent_id: null,
      category_name: null,
      category_image_media_id: null,
      category_image_storage_key: null,
      category_image_content_type: null,
      created_at: "2026-01-01T00:00:00.000Z",
      category_id: "c1"
    });

    expect(out.thumbnail?.url).toBe("https://cdn.example.com/global/curd.jpg");
    expect(out.images).toHaveLength(1);
    expect(out.images[0].url).toBe("https://cdn.example.com/global/curd.jpg");
    expect(out.images[0]).not.toHaveProperty("mediaAssetId");
    expect(out.images[0]).not.toHaveProperty("storageKey");
  });
});
