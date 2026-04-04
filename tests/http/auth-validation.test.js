import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";

describe("POST /api/auth/register (validation)", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 400 when shopId is missing", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        email: "buyer@example.com",
        password: "secret12"
      })
      .expect(400);

    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when shopId is not a valid UUID", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        shopId: "not-a-uuid",
        email: "buyer@example.com",
        password: "secret12"
      })
      .expect(400);

    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when password is too short", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        shopId: "00000000-0000-0000-0000-000000000001",
        email: "buyer@example.com",
        password: "12345"
      })
      .expect(400);

    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/auth/login (validation)", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 400 when email is invalid", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "not-an-email",
        password: "secret12"
      })
      .expect(400);

    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when password is missing", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "buyer@example.com"
      })
      .expect(400);

    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });
});
