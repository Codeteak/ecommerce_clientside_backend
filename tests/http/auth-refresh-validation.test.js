import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";

describe("auth refresh route validation", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 400 for missing refreshToken body", async () => {
    const res = await request(app).post("/api/auth/refresh").send({}).expect(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("is mounted at /api/auth/refresh (not 404)", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "x".repeat(24) });
    expect(res.status).not.toBe(404);
  });
});
