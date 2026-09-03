import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { io as ioc } from "socket.io-client";

const STOREFRONT_TOKEN = "catalog-storefront-test-token";
const STAFF_TOKEN = "staff-connect-test-token";
const SHOP_ID = "00000000-0000-4000-8000-000000000001";

vi.mock("../../../src/config/env.js", () => ({
  env: {
    STOREFRONT_CATALOG_REALTIME_TOKEN: "catalog-storefront-test-token",
    REALTIME_CONNECT_TOKEN: "staff-connect-test-token"
  }
}));

vi.mock("../../../src/infra/auth/jwt.js", () => ({
  verifyStaffAccessToken: vi.fn(() => {
    throw new Error("not staff");
  })
}));

const { createRealtimeServer, shopRoom, shopCatalogRoom } = await import(
  "../../../src/infra/realtime/createRealtimeServer.js"
);

function waitForEvent(socket, eventName, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${eventName}`)), timeoutMs);
    socket.once(eventName, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function waitForConnect(socket, timeoutMs = 3000) {
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

describe("createRealtimeServer catalog.invalidated", () => {
  /** @type {import("node:http").Server | null} */
  let httpServer = null;
  /** @type {ReturnType<typeof createRealtimeServer> extends Promise<infer T> ? T : never} */
  let realtime = null;
  let port = 0;

  beforeEach(async () => {
    httpServer = http.createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    realtime = await createRealtimeServer(httpServer, { redis: null, logger: null });
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

  it("emitCatalogInvalidated targets shop catalog room", () => {
    const toSpy = vi.spyOn(realtime.io, "to");
    realtime.emitCatalogInvalidated({ shopId: SHOP_ID });
    expect(toSpy).toHaveBeenCalledWith(shopCatalogRoom(SHOP_ID));
  });

  it("emitOrderPlaced targets staff shop room only", () => {
    const toSpy = vi.spyOn(realtime.io, "to");
    realtime.emitOrderPlaced({
      shopId: SHOP_ID,
      orderId: "order-1",
      orderNumber: "1001"
    });
    expect(toSpy).toHaveBeenCalledWith(shopRoom(SHOP_ID));
    expect(toSpy).not.toHaveBeenCalledWith(shopCatalogRoom(SHOP_ID));
  });

  it("emitCatalogInvalidated includes productIds when provided", async () => {
    const storefront = ioc(`http://127.0.0.1:${port}`, {
      path: "/socket.io",
      transports: ["websocket"],
      auth: { shopId: SHOP_ID, token: STOREFRONT_TOKEN }
    });
    await waitForConnect(storefront);

    const catalogPromise = waitForEvent(storefront, "catalog.invalidated");
    realtime.emitCatalogInvalidated({ shopId: SHOP_ID, productIds: ["p1", "p2"] });
    const catalogPayload = await catalogPromise;
    expect(catalogPayload).toEqual({ shopId: SHOP_ID, productIds: ["p1", "p2"] });

    storefront.close();
  });

  it("storefront client receives catalog.invalidated but not order.placed", async () => {
    const storefront = ioc(`http://127.0.0.1:${port}`, {
      path: "/socket.io",
      transports: ["websocket"],
      auth: { shopId: SHOP_ID, token: STOREFRONT_TOKEN }
    });
    const staff = ioc(`http://127.0.0.1:${port}`, {
      path: "/socket.io",
      transports: ["websocket"],
      auth: { shopId: SHOP_ID, token: STAFF_TOKEN }
    });

    await Promise.all([waitForConnect(storefront), waitForConnect(staff)]);

    const catalogPromise = waitForEvent(storefront, "catalog.invalidated");
    realtime.emitCatalogInvalidated({ shopId: SHOP_ID });
    const catalogPayload = await catalogPromise;
    expect(catalogPayload).toEqual({ shopId: SHOP_ID });

    let storefrontGotOrder = false;
    storefront.on("order.placed", () => {
      storefrontGotOrder = true;
    });

    const staffOrderPromise = waitForEvent(staff, "order.placed");
    realtime.emitOrderPlaced({
      shopId: SHOP_ID,
      orderId: "order-1",
      orderNumber: "1001",
      totalMinor: 1000
    });
    const staffOrder = await staffOrderPromise;
    expect(staffOrder.orderId).toBe("order-1");

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(storefrontGotOrder).toBe(false);

    storefront.close();
    staff.close();
  });
});

describe("invalidateShopCatalogCache hook", () => {
  it("calls emitCatalogInvalidated after redis cache bump", async () => {
    const emitCatalogInvalidated = vi.fn();
    const catalogCache = {
      invalidateShopCatalog: vi.fn().mockResolvedValue(undefined)
    };
    const shopResolveCache = {
      invalidateShop: vi.fn().mockResolvedValue(undefined)
    };

    async function invalidateShopCatalogCache(shopId) {
      await catalogCache.invalidateShopCatalog(shopId);
      await shopResolveCache.invalidateShop(shopId);
      emitCatalogInvalidated({ shopId });
    }

    await invalidateShopCatalogCache(SHOP_ID);

    expect(catalogCache.invalidateShopCatalog).toHaveBeenCalledWith(SHOP_ID);
    expect(shopResolveCache.invalidateShop).toHaveBeenCalledWith(SHOP_ID);
    expect(emitCatalogInvalidated).toHaveBeenCalledWith({ shopId: SHOP_ID });
  });
});
