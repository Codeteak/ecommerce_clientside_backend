import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";
import { storefrontProductsQuerySchema } from "../../src/interface/http/validations/storefrontCatalogSchemas.js";

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

  it("accepts include_all_availability query flag", () => {
    const parsed = storefrontProductsQuerySchema.parse({
      include_all_availability: "true",
      limit: "5"
    });
    expect(parsed.include_all_availability).toBe(true);
    expect(parsed.limit).toBe(5);
  });

  it("accepts full filter/sort query shape", () => {
    const parsed = storefrontProductsQuerySchema.parse({
      category_id: "11111111-1111-4111-8111-111111111111",
      brand_id: "22222222-2222-4222-8222-222222222222",
      search: "apple",
      availability: "in_stock",
      min_price_minor: "100",
      max_price_minor: "1000",
      sort_by: "price",
      sort_order: "desc",
      limit: "20"
    });
    expect(parsed.category_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(parsed.brand_id).toBe("22222222-2222-4222-8222-222222222222");
    expect(parsed.search).toBe("apple");
    expect(parsed.availability).toBe("in_stock");
    expect(parsed.min_price_minor).toBe(100);
    expect(parsed.max_price_minor).toBe(1000);
    expect(parsed.sort_by).toBe("price");
    expect(parsed.sort_order).toBe("desc");
    expect(parsed.limit).toBe(20);
  });

  it("accepts search_mode=prefix", () => {
    const parsed = storefrontProductsQuerySchema.parse({
      search: "mil",
      search_mode: "prefix",
      limit: "5"
    });
    expect(parsed.search_mode).toBe("prefix");
    expect(parsed.search).toBe("mil");
  });

  it("rejects invalid search_mode", async () => {
    const res = await request(app)
      .get("/storefront/products?search_mode=regex")
      .expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("applies the same validation under /api/storefront alias", async () => {
    const res = await request(app).get("/api/storefront/products?sort_by=random").expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });
});
