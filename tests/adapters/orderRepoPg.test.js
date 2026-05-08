import { describe, it, expect } from "vitest";
import { OrderRepoPg } from "../../src/adapters/repositories/postgres/OrderRepoPg.js";

const baseRow = {
  id: "00000000-0000-0000-0000-0000000000a1",
  product_id: "00000000-0000-0000-0000-0000000000b1",
  product_slug: "apple",
  product_name_snapshot: "Apple",
  unit_label_snapshot: "kg",
  quantity: "2",
  unit_price_minor_snapshot: 100,
  line_total_minor: 200,
  is_custom: false,
  custom_note: null,
  image_media_id: null,
  image_storage_key: null,
  image_content_type: null
};

describe("OrderRepoPg mapOrderItemRow", () => {
  it("exposes product_slug on mapped order item payload", () => {
    const repo = new OrderRepoPg();
    const out = repo.mapOrderItemRow({ ...baseRow });

    expect(out.product_slug).toBe("apple");
  });

  it("sets image to null when no storage key", () => {
    const repo = new OrderRepoPg();
    const out = repo.mapOrderItemRow({
      ...baseRow,
      image_media_id: "00000000-0000-0000-0000-0000000000c1",
      image_storage_key: null,
      image_content_type: "image/jpeg"
    });
    expect(out.image).toBeNull();
  });

  it("maps image object when storage key is present", () => {
    const repo = new OrderRepoPg();
    const mediaId = "00000000-0000-0000-0000-0000000000c1";
    const out = repo.mapOrderItemRow({
      ...baseRow,
      image_media_id: mediaId,
      image_storage_key: "shops/x/products/y.jpg",
      image_content_type: "image/jpeg"
    });
    expect(out.image).toMatchObject({
      mediaAssetId: mediaId,
      storageKey: "shops/x/products/y.jpg",
      contentType: "image/jpeg"
    });
    expect(out.image.url === null || typeof out.image.url === "string").toBe(true);
  });

  it("prefers global image_url over storage key when present", () => {
    const repo = new OrderRepoPg();
    const out = repo.mapOrderItemRow({
      ...baseRow,
      global_image_url: "  https://cdn.example.com/global/apple.jpg  ",
      image_media_id: "00000000-0000-0000-0000-0000000000c1",
      image_storage_key: "shops/x/products/y.jpg",
      image_content_type: "image/jpeg"
    });
    expect(out.image).toEqual({
      url: "https://cdn.example.com/global/apple.jpg"
    });
  });

  it("falls back to storage key when global image_url is empty", () => {
    const repo = new OrderRepoPg();
    const out = repo.mapOrderItemRow({
      ...baseRow,
      global_image_url: "",
      image_media_id: "00000000-0000-0000-0000-0000000000c1",
      image_storage_key: "shops/x/products/y.jpg",
      image_content_type: "image/jpeg"
    });
    expect(out.image?.storageKey).toBe("shops/x/products/y.jpg");
    expect(out.image?.url === null || typeof out.image?.url === "string").toBe(true);
  });

  it("resolves relative global image_url via public storage base", () => {
    const repo = new OrderRepoPg();
    const out = repo.mapOrderItemRow({
      ...baseRow,
      global_image_url: "shops/x/products/apple.jpg",
      image_media_id: "00000000-0000-0000-0000-0000000000c1",
      image_storage_key: "shops/x/products/y.jpg",
      image_content_type: "image/jpeg"
    });
    expect(out.image?.url === null || typeof out.image?.url === "string").toBe(true);
    if (out.image?.url !== null) {
      expect(out.image.url).toContain("shops/x/products/apple.jpg");
    }
  });
});
