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
      .expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
    expect(res.body.error?.message).toContain("shopId is required");
  });

  it("applies the same validation under /api/storefront alias", async () => {
    const res = await request(app).get("/api/storefront/products?sort_by=random").expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });
});
