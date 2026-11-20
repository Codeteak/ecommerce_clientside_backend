import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";

describe("CORS preflight", () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  it("allows the storefront origin and preflight headers", async () => {
    const res = await request(app)
      .options("/api/storefront/orders")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "GET")
      .set(
        "Access-Control-Request-Headers",
        "accept,authorization,x-request-id,x-shop-id,ngrok-skip-browser-warning"
      )
      .expect(204);

    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-methods"]).toContain("GET");
    expect(res.headers["access-control-allow-methods"]).toContain("OPTIONS");
    expect(res.headers["access-control-allow-headers"]).toContain("authorization");
    expect(res.headers["access-control-allow-headers"]).toContain("x-shop-id");
    expect(res.headers["access-control-allow-headers"]).toContain("x-request-id");
    expect(res.headers["access-control-allow-headers"]).toContain("ngrok-skip-browser-warning");
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("does not allow an unknown origin", async () => {
    const res = await request(app).get("/health").set("Origin", "https://evil.example").expect(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
