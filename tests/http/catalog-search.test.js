import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";

const validShopId = "550e8400-e29b-41d4-a716-446655440000";

describe("GET /api/catalog/search", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 400 when shopId is missing", async () => {
    const res = await request(app).get("/api/catalog/search?type=products").expect(400);

    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
    expect(res.body.error?.message).toMatch(/shopId/i);
  });

  it("returns 400 when shopId is not a valid UUID", async () => {
    const res = await request(app)
      .get("/api/catalog/search?shopId=bad&type=products")
      .expect(400);

    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when type is invalid", async () => {
    const res = await request(app)
      .get(`/api/catalog/search?shopId=${validShopId}&type=invalid`)
      .expect(400);

    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when productSort is invalid", async () => {
    const res = await request(app)
      .get(`/api/catalog/search?shopId=${validShopId}&type=products&productSort=hack`)
      .expect(400);

    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });
});
