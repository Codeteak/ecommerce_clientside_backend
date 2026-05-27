import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";

describe("GET /api/seo/metadata", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 400 when pageType is product without slug", async () => {
    const res = await request(app)
      .get("/api/seo/metadata")
      .set("X-Shop-Id", "11111111-1111-4111-8111-111111111111")
      .query({ pageType: "product" })
      .expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when pageType is missing", async () => {
    const res = await request(app)
      .get("/api/seo/metadata")
      .set("X-Shop-Id", "11111111-1111-4111-8111-111111111111")
      .expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when shopId is missing", async () => {
    const res = await request(app)
      .get("/api/seo/metadata")
      .query({ pageType: "shop" })
      .expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("does not require customer authentication", async () => {
    const res = await request(app)
      .get("/api/seo/metadata")
      .set("X-Shop-Id", "11111111-1111-4111-8111-111111111111")
      .query({ pageType: "shop" });
    expect(res.status).not.toBe(401);
  });
});
