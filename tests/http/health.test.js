import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";

describe("GET /", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 200 with service discovery pointers", async () => {
    const res = await request(app).get("/").expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe("clientside-ecommerce-api");
    expect(res.body.openapi).toBe("/openapi.json");
    expect(res.body.swaggerUi).toBe("/api-docs");
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
      status: "ok"
    });
  });
});

describe("GET /health/ready", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns 200 when database (and optional Redis) are up", async () => {
    const res = await request(app).get("/health/ready").expect(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.checks?.database).toBe("ok");
  });
});

describe("GET /metrics", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("returns JSON counters", async () => {
    await request(app).get("/health");
    const res = await request(app).get("/metrics").expect(200);
    expect(typeof res.body.requests_total).toBe("number");
    expect(res.body.by_method_route_status).toBeDefined();
  });
});
