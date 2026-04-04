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
    expect(res.body.error?.code).toBe("NOT_FOUND");
  });

  it("returns 400 INVALID_JSON for malformed JSON body", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email":"a@b.com","password":"secret12"}x')
      .expect(400);

    expect(res.body.error?.code).toBe("INVALID_JSON");
  });
});
