import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";

const validShopId = "550e8400-e29b-41d4-a716-446655440000";

describe("GET /api/catalog/items (validation)", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 400 when shopId is missing", async () => {
    const res = await request(app).get("/api/catalog/items").expect(400);

    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
    expect(res.body.error?.message).toMatch(/shopId/i);
  });

  it("returns 400 when shopId is not a valid UUID", async () => {
    const res = await request(app).get("/api/catalog/items?shopId=bad").expect(400);

    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/catalog/categories (validation)", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 400 when shopId is missing", async () => {
    const res = await request(app).get("/api/catalog/categories").expect(400);

    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when parentId is not a valid UUID", async () => {
    const res = await request(app)
      .get(`/api/catalog/categories?shopId=${validShopId}&parentId=not-a-uuid`)
      .expect(400);

    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/catalog/products (validation)", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 400 when shopId is missing", async () => {
    const res = await request(app).get("/api/catalog/products").expect(400);

    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when categoryId is not a valid UUID", async () => {
    const res = await request(app)
      .get(`/api/catalog/products?shopId=${validShopId}&categoryId=bad`)
      .expect(400);

    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });
});
