import crypto from "node:crypto";
import { env } from "../../config/env.js";

/**
 * Purpose: This file signs and verifies the storefront serviceability cookie.
 * It protects location/shop eligibility payloads with an HMAC signature so
 * clients cannot tamper with serviceability data.
 */
const COOKIE_NAME = "storefront_serviceability";

export function getServiceabilityCookieName() {
  return COOKIE_NAME;
}

export function signServiceabilityPayload(obj) {
  const payload = Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", env.JWT_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyServiceabilityCookie(raw) {
  if (!raw || typeof raw !== "string") return null;
  const i = raw.lastIndexOf(".");
  if (i <= 0) return null;
  const payload = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const expected = crypto.createHmac("sha256", env.JWT_SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }
  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!json || typeof json !== "object") return null;
    return json;
  } catch {
    return null;
  }
}
