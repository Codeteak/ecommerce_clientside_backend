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

  it("maps category row with shop_category_images fallback storage key", () => {
    const out = mapStorefrontCategoryRow({
      id: "c1",
      name: "Dairy",
      slug: "dairy",
      parent_id: null,
      sort_order: 0,
      image_media_id: "media-1",
      image_storage_key: "shared/blobs/category/dairy.jpg",
      image_content_type: "image/jpeg"
    });
    expect(out.image).toEqual({
      url: expect.stringContaining("shared/blobs/category/dairy.jpg"),
      mediaAssetId: "media-1",
      storageKey: "shared/blobs/category/dairy.jpg",
      contentType: "image/jpeg"
    });
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
    expect(out.unit_size).toBe("1");
  });

  it("maps product unit_size from catalog row", () => {
    const out = mapStorefrontProductRow({
      id: "p1",
      name: "Milk",
      slug: "milk",
      price_minor_per_unit: "100",
      offer_price_minor_per_unit: "90",
      availability: "in_stock",
      base_unit: "L",
      unit_size: "0.5",
      thumb_media_id: null,
      thumb_storage_key: null,
      thumb_content_type: null,
      product_images: "[]",
      category_slug: null,
      category_parent_id: null,
      category_name: null,
      category_image_media_id: null,
      category_image_storage_key: null,
      category_image_content_type: null,
      created_at: "2026-01-01T00:00:00.000Z",
      category_id: "c1"
    });
    expect(out.unit).toBe("L");
    expect(out.unit_size).toBe("0.5");
  });

  it("maps product description from catalog row", () => {
    const out = mapStorefrontProductRow({
      id: "p1",
      name: "Milk",
      slug: "milk",
      description: "Fresh full cream milk",
      price_minor_per_unit: "100",
      offer_price_minor_per_unit: "90",
      availability: "in_stock",
      base_unit: "L",
      unit_size: "1",
      thumb_media_id: null,
      thumb_storage_key: null,
      thumb_content_type: null,
      product_images: "[]",
      category_slug: null,
      category_parent_id: null,
      category_name: null,
      category_image_media_id: null,
      category_image_storage_key: null,
      category_image_content_type: null,
      created_at: "2026-01-01T00:00:00.000Z",
      category_id: "c1"
    });
    expect(out.description).toBe("Fresh full cream milk");
  });

  it("returns null description when row description is empty", () => {
    const out = mapStorefrontProductRow({
      id: "p1",
      name: "Milk",
      slug: "milk",
      description: "   ",
      price_minor_per_unit: "100",
      offer_price_minor_per_unit: "90",
      availability: "in_stock",
      base_unit: "L",
      unit_size: "1",
      thumb_media_id: null,
      thumb_storage_key: null,
      thumb_content_type: null,
      product_images: "[]",
      category_slug: null,
      category_parent_id: null,
      category_name: null,
      category_image_media_id: null,
      category_image_storage_key: null,
      category_image_content_type: null,
      created_at: "2026-01-01T00:00:00.000Z",
      category_id: "c1"
    });
    expect(out.description).toBeNull();
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

  it("prefers global image_url over R2 gallery and preserves exact whitespace", () => {
    const out = mapStorefrontProductRow({
      id: "p3",
      name: "Bread",
      slug: "bread",
      price_minor_per_unit: "60",
      offer_price_minor_per_unit: "55",
      availability: "in_stock",
      base_unit: "pack",
      thumb_media_id: "m9",
      thumb_storage_key: "products/bread.jpg",
      thumb_content_type: "image/jpeg",
      product_images: JSON.stringify([
        {
          media_asset_id: "m9",
          sort_order: 0,
          storage_key: "products/bread.jpg",
          content_type: "image/jpeg"
        }
      ]),
      global_image_url: "  https://cdn.example.com/global/bread.jpg  ",
      category_slug: null,
      category_parent_id: null,
      category_name: null,
      category_image_media_id: null,
      category_image_storage_key: null,
      category_image_content_type: null,
      created_at: "2026-01-01T00:00:00.000Z",
      category_id: "c1"
    });

    expect(out.thumbnail?.url).toBe("  https://cdn.example.com/global/bread.jpg  ");
    expect(out.images).toEqual([
      {
        sortOrder: 0,
        contentType: null,
        url: "  https://cdn.example.com/global/bread.jpg  "
      }
    ]);
  });

  it("falls back to R2 when global image_url is empty string", () => {
    const out = mapStorefrontProductRow({
      id: "p4",
      name: "Paneer",
      slug: "paneer",
      price_minor_per_unit: "220",
      offer_price_minor_per_unit: "200",
      availability: "in_stock",
      base_unit: "kg",
      thumb_media_id: "m4",
      thumb_storage_key: "products/paneer.jpg",
      thumb_content_type: "image/jpeg",
      product_images: JSON.stringify([
        {
          media_asset_id: "m4",
          sort_order: 0,
          storage_key: "products/paneer.jpg",
          content_type: "image/jpeg"
        }
      ]),
      global_image_url: "",
      category_slug: null,
      category_parent_id: null,
      category_name: null,
      category_image_media_id: null,
      category_image_storage_key: null,
      category_image_content_type: null,
      created_at: "2026-01-01T00:00:00.000Z",
      category_id: "c1"
    });

    expect(out.thumbnail === null || out.thumbnail.storageKey === "products/paneer.jpg").toBe(true);
    expect(out.images).toHaveLength(1);
    expect(out.images[0].storageKey).toBe("products/paneer.jpg");
    expect(out.images[0].mediaAssetId).toBe("m4");
    expect(out.images[0].url === null || typeof out.images[0].url === "string").toBe(true);
  });
});
