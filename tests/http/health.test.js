import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";

describe("GET /health", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.body).toMatchObject({
      status: "ok",
      service: "clientside-ecommerce-api"
    });
  });
});
