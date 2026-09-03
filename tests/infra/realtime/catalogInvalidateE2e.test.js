import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";
import express from "express";
import { io as ioc } from "socket.io-client";

const STOREFRONT_TOKEN = "catalog-storefront-e2e-token";
const INVALIDATE_TOKEN = "catalog-invalidate-e2e-token";
const SHOP_ID = "00000000-0000-4000-8000-000000000002";

vi.mock("../../../src/config/env.js", () => ({
  env: {
    STOREFRONT_CATALOG_REALTIME_TOKEN: "catalog-storefront-e2e-token",
    REALTIME_CONNECT_TOKEN: "staff-connect-e2e-token",
    CATALOG_CACHE_INVALIDATE_TOKEN: "catalog-invalidate-e2e-token"
  }
}));

vi.mock("../../../src/infra/auth/jwt.js", () => ({
  verifyStaffAccessToken: vi.fn(() => {
    throw new Error("not staff");
  })
}));

const { createRealtimeServer } = await import(
  "../../../src/infra/realtime/createRealtimeServer.js"
);

function waitForEvent(socket, eventName, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${eventName}`)), timeoutMs);
    socket.once(eventName, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function waitForConnect(socket, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }
    const timer = setTimeout(() => reject(new Error("connect timeout")), timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe("catalog invalidate HTTP → socket e2e", () => {
  /** @type {import("node:http").Server | null} */
  let httpServer = null;
  /** @type {ReturnType<typeof createRealtimeServer> extends Promise<infer T> ? T : never} */
  let realtime = null;
  let port = 0;
  let catalogGeneration = 0;

  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    catalogGeneration = 0;

    httpServer = http.createServer(app);
    realtime = await createRealtimeServer(httpServer, { redis: null, logger: null });

    app.get("/api/storefront/catalog/revision", (req, res) => {
      const shopId = String(req.get("x-shop-id") || "").trim();
      if (!shopId) {
        res.status(400).json({ error: "shopId required" });
        return;
      }
      res.json({ shopId, generation: catalogGeneration });
    });

    app.post("/api/storefront/catalog/cache/invalidate", async (req, res) => {
      const header = req.get("X-Catalog-Cache-Invalidate");
      if (header !== INVALIDATE_TOKEN) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const shopId = req.body?.shopId;
      if (!shopId) {
        res.status(400).json({ error: "shopId required" });
        return;
      }
      catalogGeneration += 1;
      realtime.emitCatalogInvalidated({ shopId });
      res.status(204).send();
    });

    await new Promise((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => {
        port = httpServer.address().port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await realtime?.close?.();
    await new Promise((resolve) => httpServer?.close(() => resolve()));
    httpServer = null;
    realtime = null;
  });

  it("storefront client receives catalog.invalidated after POST invalidate", async () => {
    const storefront = ioc(`http://127.0.0.1:${port}`, {
      path: "/socket.io",
      transports: ["websocket"],
      auth: { shopId: SHOP_ID, token: STOREFRONT_TOKEN }
    });

    await waitForConnect(storefront);

    const catalogPromise = waitForEvent(storefront, "catalog.invalidated");

    const res = await fetch(`http://127.0.0.1:${port}/api/storefront/catalog/cache/invalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Catalog-Cache-Invalidate": INVALIDATE_TOKEN
      },
      body: JSON.stringify({ shopId: SHOP_ID })
    });

    expect(res.status).toBe(204);

    const payload = await catalogPromise;
    expect(payload).toEqual({ shopId: SHOP_ID });

    storefront.close();
  });

  it("GET catalog/revision returns generation bumped after invalidate", async () => {
    const storefront = ioc(`http://127.0.0.1:${port}`, {
      path: "/socket.io",
      transports: ["websocket"],
      auth: { shopId: SHOP_ID, token: STOREFRONT_TOKEN }
    });
    await waitForConnect(storefront);

    const beforeRes = await fetch(`http://127.0.0.1:${port}/api/storefront/catalog/revision`, {
      headers: { "x-shop-id": SHOP_ID }
    });
    expect(beforeRes.status).toBe(200);
    const before = await beforeRes.json();
    expect(typeof before.generation).toBe("number");

    const invalidateRes = await fetch(`http://127.0.0.1:${port}/api/storefront/catalog/cache/invalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Catalog-Cache-Invalidate": INVALIDATE_TOKEN
      },
      body: JSON.stringify({ shopId: SHOP_ID })
    });
    expect(invalidateRes.status).toBe(204);

    const afterRes = await fetch(`http://127.0.0.1:${port}/api/storefront/catalog/revision`, {
      headers: { "x-shop-id": SHOP_ID }
    });
    const after = await afterRes.json();
    expect(after.generation).toBeGreaterThan(before.generation);

    storefront.close();
  });
});
