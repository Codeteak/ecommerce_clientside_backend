import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";

const STAFF_REALTIME_ROLES = new Set(["picker", "owner", "admin", "manager"]);

/**
 * Purpose: This file creates and verifies JWT access tokens.
 * It signs and verifies customer access tokens for this API.
 */
export function signCustomerAccessToken({ userId, customerId, shopId, role = "customer" }) {
  const jti = randomUUID();
  const payload = { sub: userId, customerId, role };
  if (shopId != null && shopId !== "") {
    payload.shopId = shopId;
  }
  const token = jwt.sign(payload, env.JWT_SECRET, {
    algorithm: "HS256",
    keyid: env.JWT_KEY_ID,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN || env.JWT_EXPIRES_IN,
    jwtid: jti
  });
  return { token, jti };
}

export function verifyCustomerAccessToken(token) {
  const verifyOptions = {
    algorithms: env.JWT_ALLOWED_ALGORITHMS,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE
  };
  try {
    return jwt.verify(token, env.JWT_SECRET, verifyOptions);
  } catch (err) {
    if (!env.JWT_PREVIOUS_SECRET) throw err;
    return jwt.verify(token, env.JWT_PREVIOUS_SECRET, verifyOptions);
  }
}

/** Staff/picker tokens from admin services using the same issuer/secret. */
export function verifyStaffAccessToken(token) {
  const payload = verifyCustomerAccessToken(token);
  if (!STAFF_REALTIME_ROLES.has(payload.role)) {
    throw new Error("Invalid staff token role");
  }
  return payload;
}

export function signCustomerRefreshToken({ userId, customerId }) {
  const jti = randomUUID();
  const token = jwt.sign(
    { sub: userId, customerId, typ: "refresh" },
    env.JWT_REFRESH_SECRET,
    {
      algorithm: "HS256",
      keyid: env.JWT_KEY_ID,
      issuer: env.JWT_ISSUER,
      audience: `${env.JWT_AUDIENCE}:refresh`,
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
      jwtid: jti
    }
  );
  return { token, jti };
}

export function verifyCustomerRefreshToken(token) {
  const verifyOptions = {
    algorithms: env.JWT_ALLOWED_ALGORITHMS,
    issuer: env.JWT_ISSUER,
    audience: `${env.JWT_AUDIENCE}:refresh`
  };
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET, verifyOptions);
  } catch (err) {
    if (!env.JWT_PREVIOUS_REFRESH_SECRET) throw err;
    payload = jwt.verify(token, env.JWT_PREVIOUS_REFRESH_SECRET, verifyOptions);
  }
  if (typeof payload === "string" || payload.typ !== "refresh" || !payload.jti) {
    throw new Error("Invalid refresh token");
  }
  return payload;
}
