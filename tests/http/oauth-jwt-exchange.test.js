import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";

describe("POST /api/auth/oauth/jwt", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 401 without Better Auth session cookie", async () => {
    const res = await request(app).post("/api/auth/oauth/jwt").expect(401);
    expect(res.body.error?.code).toBe("UNAUTHORIZED");
  });
});
