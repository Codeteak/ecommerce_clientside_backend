import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";

describe("GET /api/shops/resolve-by-domain", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 400 when domain query is missing", async () => {
    const res = await request(app).get("/api/shops/resolve-by-domain").expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("does not require authentication", async () => {
    const res = await request(app)
      .get("/api/shops/resolve-by-domain")
      .query({ domain: "missing.example.com" });
    expect(res.status).not.toBe(401);
  });
});
