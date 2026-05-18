import crypto from "node:crypto";
import { AppError } from "../../../domain/errors/AppError.js";

export function randomOrderNumber() {
  return `ORD-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

export function minorFromLine(q, unitPrice) {
  const line = Number(q) * Number(unitPrice);
  return Math.round(line);
}

/** @param {Record<string, unknown> | undefined} pricedLine @param {unknown} cartQty */
export function orderLineQuantitiesFromPriced(pricedLine, cartQty) {
  const cart = Number(cartQty);
  if (!pricedLine) {
    return { quantity: cart, paidQuantity: cart, freeQuantity: 0 };
  }
  const paid = Math.max(0, Number(pricedLine.paid_quantity ?? pricedLine.quantity ?? cart));
  const free = Math.max(0, Number(pricedLine.free_quantity ?? 0));
  const display = Math.max(
    paid + free,
    Number(pricedLine.display_quantity ?? 0) || paid + free
  );
  return {
    quantity: display,
    paidQuantity: paid,
    freeQuantity: free
  };
}

export function checkoutError(code, message) {
  return new AppError(message, { statusCode: 400, code });
}

export function customerAddressSnapshot(addr) {
  if (!addr) return null;
  const parts = [addr.line1, addr.line2, addr.landmark, addr.city, addr.state, addr.postalCode, addr.country]
    .map((x) => (x != null && String(x).trim() !== "" ? String(x).trim() : null))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function normalizeCouponCode(code) {
  if (typeof code !== "string") return null;
  const trimmed = code.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

export function assertValidIdempotencyKey(rawIdem) {
  if (rawIdem && (rawIdem.length < 8 || rawIdem.length > 128)) {
    throw checkoutError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key header must be between 8 and 128 characters when provided."
    );
  }
  if (rawIdem && /[\x00-\x1f\x7f]/.test(rawIdem)) {
    throw checkoutError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key must not contain control characters."
    );
  }
}
