import { describe, it, expect } from "vitest";
import { OrderRepoPg } from "../../src/adapters/repositories/postgres/OrderRepoPg.js";

describe("OrderRepoPg mapOrderItemRow", () => {
  it("exposes product_slug on mapped order item payload", () => {
    const repo = new OrderRepoPg();
    const out = repo.mapOrderItemRow({
      id: "item-1",
      product_id: "prod-1",
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
    });

    expect(out.product_slug).toBe("apple");
  });
});
