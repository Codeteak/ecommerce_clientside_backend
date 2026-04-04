import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";

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
