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

  it("returns Prometheus text with http_requests_total", async () => {
    await request(app).get("/health");
    const res = await request(app).get("/metrics").expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toContain("http_requests_total");
  });
});
