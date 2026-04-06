import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";

describe("GET /", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 200 with pointers (avoids bare-root ROUTE_NOT_FOUND after OAuth redirect)", async () => {
    const res = await request(app).get("/").expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe("clientside-ecommerce-api");
    expect(res.body.oauthAfterLogin).toBe("/api/oauth/success");
  });
});

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
