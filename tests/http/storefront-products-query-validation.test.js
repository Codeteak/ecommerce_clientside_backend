import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";

describe("Storefront products query validation", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("rejects min_price_minor greater than max_price_minor", async () => {
    const res = await request(app)
      .get("/storefront/products?min_price_minor=2000&max_price_minor=1000")
      .expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("rejects cursor with non-created_at sorting", async () => {
    const res = await request(app)
      .get("/storefront/products?sort_by=price&sort_order=asc&cursor=abc")
      .expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid sort enum values", async () => {
    const res = await request(app).get("/storefront/products?sort_by=random").expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("accepts full filter/sort query shape", async () => {
    const res = await request(app)
      .get(
        "/storefront/products?category_id=11111111-1111-4111-8111-111111111111&brand_id=22222222-2222-4222-8222-222222222222&search=apple&availability=in_stock&min_price_minor=100&max_price_minor=1000&sort_by=price&sort_order=desc&limit=20"
      )
      .expect(200);
    if (Object.keys(res.body).length === 0) {
      return;
    }
    if ("promotions_paused" in res.body) {
      expect(typeof res.body.promotions_paused).toBe("boolean");
    }
    if ("categories" in res.body) {
      expect(Array.isArray(res.body.categories)).toBe(true);
    }
    if ("products" in res.body) {
      expect(Array.isArray(res.body.products)).toBe(true);
      if (res.body.products.length > 0) {
        const p = res.body.products[0];
        expect(p).toHaveProperty("actual_price_minor");
        expect(p).toHaveProperty("offer_price_minor");
        expect(p).toHaveProperty("promo_price_minor");
        expect(p).toHaveProperty("total_price_minor");
        expect(p).toHaveProperty("final_price_minor");
        expect(p).toHaveProperty("offer_discount_minor");
        expect(p).toHaveProperty("promo_discount_minor");
        expect(p).toHaveProperty("total_discount_minor");
        expect(Array.isArray(p.bundle_rules)).toBe(true);
      }
    }
  });

  it("applies the same validation under /api/storefront alias", async () => {
    const res = await request(app).get("/api/storefront/products?sort_by=random").expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });
});
