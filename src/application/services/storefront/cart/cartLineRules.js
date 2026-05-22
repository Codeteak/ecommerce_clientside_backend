import { ValidationError } from "../../../../domain/errors/ValidationError.js";
import { AppError } from "../../../../domain/errors/AppError.js";

export const BUNDLE_REWARD_ID_SUFFIX = ":bundle-reward";
export const MAX_LINE_QUANTITY = 10;

export function parseBillableCartQuantity(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

export function normalizeCouponCode(code) {
  if (typeof code !== "string") return null;
  const trimmed = code.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

export function cartError(code, message, statusCode = 400) {
  return new AppError(message, { statusCode, code });
}

export function assertLineQuantity(qty) {
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new ValidationError("quantity must be positive");
  }
  if (qty > MAX_LINE_QUANTITY) {
    throw cartError(
      "LINE_QUANTITY_CAP",
      `Maximum quantity per line is ${MAX_LINE_QUANTITY}.`
    );
  }
}

export function assertSellableProductSnapshot(product) {
  if (!product) {
    throw cartError(
      "PRODUCT_UNAVAILABLE",
      "One or more products are unavailable. Please refresh your cart."
    );
  }
}

/** @returns {string | null} removal reason code when line cannot be sold as stored */
export function cartLineRemovalReason(product, quantityRaw) {
  if (!product) return "PRODUCT_UNAVAILABLE";
  const qty = parseBillableCartQuantity(quantityRaw);
  if (qty <= 0) return "INVALID_QUANTITY";
  if (qty > MAX_LINE_QUANTITY) return "LINE_QUANTITY_CAP";
  return null;
}

export function assertWritableCartItemId(itemId) {
  if (String(itemId).includes(BUNDLE_REWARD_ID_SUFFIX)) {
    throw new ValidationError(
      "Bundle reward lines are read-only; update the paid cart item quantity instead."
    );
  }
}

/**
 * @param {{ quantity?: unknown, delta?: unknown }} body
 * @param {number | null} currentQty
 */
export function resolveRequestedQuantity(body, currentQty = null) {
  const hasDelta = body?.delta !== undefined && body?.delta !== null && body?.delta !== "";
  const hasQty = body?.quantity !== undefined && body?.quantity !== null && body?.quantity !== "";

  if (hasDelta) {
    const delta = Number(body.delta);
    if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
      throw new ValidationError("delta must be an integer");
    }
    if (currentQty == null) {
      if (delta <= 0) {
        throw new ValidationError("delta must be positive when adding a new line");
      }
      return delta;
    }
    return Number(currentQty) + delta;
  }

  if (hasQty) {
    return Number(body.quantity);
  }

  throw new ValidationError("quantity or delta is required");
}

export function mapCouponReasonMessage(code) {
  const messages = {
    MIN_SUBTOTAL_NOT_MET: "Cart subtotal does not meet the minimum for this coupon.",
    FIRST_ORDER_ONLY_NOT_MET: "This coupon is for first orders only.",
    NEW_CUSTOMER_ONLY_NOT_MET: "This coupon is for new customers only.",
    COUPON_NOT_FOUND: "Coupon not found.",
    COUPON_EXHAUSTED: "This coupon has reached its redemption limit.",
    COUPON_NOT_APPLICABLE: "Coupon cannot be applied to this cart.",
    EMPTY_CART_WITH_COUPON: "Cannot apply a coupon to an empty cart."
  };
  return messages[code] ?? "Coupon cannot be applied to this cart.";
}
