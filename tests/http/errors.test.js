import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";

describe("HTTP errors", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/api/does-not-exist").expect(404);
    expect(res.body.error?.code).toBe("ROUTE_NOT_FOUND");
  });

  it("returns 400 INVALID_JSON for malformed JSON body", async () => {
    const res = await request(app)
      .post("/api/auth/otp/request")
      .set("Content-Type", "application/json")
      .send('{"phone":"+919999999999","shopId":"00000000-0000-4000-8000-000000000001"}x')
      .expect(400);

    expect(res.body.error?.code).toBe("INVALID_JSON");
  });
});
