import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { signCustomerAccessToken } from "../../src/infra/auth/jwt.js";
import { getTestApp } from "../helpers/testApp.js";

function customerBearer() {
  const { token } = signCustomerAccessToken({
    userId: "00000000-0000-0000-0000-000000000001",
    customerId: "00000000-0000-0000-0000-000000000002"
  });
  return token;
}

describe("GET /api/me/profile", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 401 without Authorization header", async () => {
    const res = await request(app).get("/api/me/profile").expect(401);
    expect(res.body.error?.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 for invalid Bearer token", async () => {
    const res = await request(app)
      .get("/api/me/profile")
      .set("Authorization", "Bearer not-a-valid-jwt")
      .expect(401);
    expect(res.body.error?.code).toBe("UNAUTHORIZED");
  });
});

describe("PATCH /api/me/profile (validation)", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 401 without Bearer token", async () => {
    const res = await request(app)
      .patch("/api/me/profile")
      .send({ displayName: "x" })
      .expect(401);
    expect(res.body.error?.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 when displayName is too long", async () => {
    const res = await request(app)
      .patch("/api/me/profile")
      .set("Authorization", `Bearer ${customerBearer()}`)
      .send({ displayName: "x".repeat(121) })
      .expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for unknown top-level body key", async () => {
    const res = await request(app)
      .patch("/api/me/profile")
      .set("Authorization", `Bearer ${customerBearer()}`)
      .send({ displayName: "ok", notAllowed: true })
      .expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when address is an empty object", async () => {
    const res = await request(app)
      .patch("/api/me/profile")
      .set("Authorization", `Bearer ${customerBearer()}`)
      .send({ address: {} })
      .expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });
});
