#!/usr/bin/env node
/**
 * Smoke test: storefront socket receives catalog.invalidated after cache invalidate hook.
 * Run with customer API dev server (REALTIME_ENABLED=true, Redis, tokens set):
 *   node scripts/verify-catalog-realtime.mjs
 *
 * Env:
 *   VERIFY_API_ORIGIN (default http://127.0.0.1:4100)
 *   VERIFY_SHOP_ID
 *   VERIFY_CATALOG_INVALIDATE_TOKEN (X-Catalog-Cache-Invalidate)
 *   VERIFY_STOREFRONT_CATALOG_REALTIME_TOKEN (socket auth)
 */

import { io } from "socket.io-client";

const origin = (process.env.VERIFY_API_ORIGIN || "http://127.0.0.1:4100").replace(/\/+$/, "");
const shopId =
  process.env.VERIFY_SHOP_ID || "c0000001-0000-4000-8000-000000000001";
const invalidateToken = process.env.VERIFY_CATALOG_INVALIDATE_TOKEN || "";
const storefrontToken = process.env.VERIFY_STOREFRONT_CATALOG_REALTIME_TOKEN || "";

function fail(msg) {
  console.error(`[verify-catalog-realtime] FAIL: ${msg}`);
  process.exit(1);
}

if (!invalidateToken || !storefrontToken) {
  fail(
    "Set VERIFY_CATALOG_INVALIDATE_TOKEN and VERIFY_STOREFRONT_CATALOG_REALTIME_TOKEN (must match API env)."
  );
}

const socket = io(origin, {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  auth: { shopId, token: storefrontToken },
  reconnection: false,
  timeout: 8000,
});

const connected = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("socket connect timeout")), 10000);
  socket.once("connect", () => {
    clearTimeout(timer);
    resolve(true);
  });
  socket.once("connect_error", (err) => {
    clearTimeout(timer);
    reject(err);
  });
});

if (!connected) fail("socket did not connect");

const eventPromise = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("catalog.invalidated timeout")), 10000);
  socket.once("catalog.invalidated", (payload) => {
    clearTimeout(timer);
    resolve(payload);
  });
});

const invalidateUrl = `${origin}/api/storefront/catalog/cache/invalidate`;
const res = await fetch(invalidateUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Catalog-Cache-Invalidate": invalidateToken,
  },
  body: JSON.stringify({ shopId }),
});

if (!res.ok && res.status !== 204) {
  const body = await res.text().catch(() => "");
  fail(`invalidate HTTP ${res.status}: ${body.slice(0, 200)}`);
}

let payload;
try {
  payload = await eventPromise;
} catch (err) {
  fail(err.message);
} finally {
  socket.close();
}

if (!payload || String(payload.shopId) !== String(shopId)) {
  fail(`unexpected payload: ${JSON.stringify(payload)}`);
}

console.log(
  `[verify-catalog-realtime] OK — received catalog.invalidated for shop ${shopId}`
);
