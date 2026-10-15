import { ValidationError } from "../../../../domain/errors/ValidationError.js";
import { AppError } from "../../../../domain/errors/AppError.js";

export const BUNDLE_REWARD_ID_SUFFIX = ":bundle-reward";
export const MAX_LINE_QUANTITY = 10;

export function parseBillableCartQuantity(raw, { allowFractional = false } = {}) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (allowFractional) {
    // Match admin sellable unit size: up to 4 decimal places (kg).
    return Math.round(n * 10_000) / 10_000;
  }
  return Math.trunc(n);
}

/**
 * Normalize a checkout line quantity after catalog lock.
 * Weight products may be fractional; piece products must be whole numbers.
 * @param {number} rawQty
 * @param {boolean} soldByWeight
 * @returns {number}
 */
export function normalizeCheckoutLineQuantity(rawQty, soldByWeight) {
  if (soldByWeight) {
    const quantity = parseBillableCartQuantity(rawQty, { allowFractional: true });
    if (quantity <= 0) {
      throw cartError("INVALID_QUANTITY", "Quantity must be positive.");
    }
    if (quantity > MAX_LINE_QUANTITY) {
      throw cartError(
        "LINE_QUANTITY_CAP",
        `Maximum quantity per line is ${MAX_LINE_QUANTITY}.`
      );
    }
    return quantity;
  }
  if (!Number.isFinite(rawQty) || rawQty <= 0) {
    throw cartError("INVALID_QUANTITY", "Quantity must be positive.");
  }
  if (!Number.isInteger(rawQty)) {
    throw cartError(
      "INVALID_QUANTITY",
      "Quantity must be a whole number for this product."
    );
  }
  if (rawQty > MAX_LINE_QUANTITY) {
    throw cartError(
      "LINE_QUANTITY_CAP",
      `Maximum quantity per line is ${MAX_LINE_QUANTITY}.`
    );
  }
  return rawQty;
}

export function normalizeCouponCode(code) {
  if (typeof code !== "string") return null;
  const trimmed = code.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

export function cartError(code, message, statusCode = 400) {
  return new AppError(message, { statusCode, code });
}

export function assertLineQuantity(qty, { allowFractional = false } = {}) {
  const n = allowFractional
    ? parseBillableCartQuantity(qty, { allowFractional: true })
    : Number(qty);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError("quantity must be positive");
  }
  if (n > MAX_LINE_QUANTITY) {
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

function rupeeFromMinor(minor) {
  const major = Math.max(0, Number(minor) || 0) / 100;
  const rounded = Math.round(major * 100) / 100;
  if (Number.isInteger(rounded)) return `₹${rounded.toLocaleString("en-IN")}`;
  return `₹${rounded.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function mapCouponReasonMessage(code) {
  const messages = {
    MIN_SUBTOTAL_NOT_MET: "Your order is below the minimum for this coupon.",
    FIRST_ORDER_ONLY_NOT_MET: "This coupon is only for your first order.",
    NEW_CUSTOMER_ONLY_NOT_MET: "This coupon is only for new customers.",
    COUPON_NOT_FOUND: "This coupon code was not found.",
    COUPON_EXHAUSTED: "This coupon has reached its usage limit.",
    COUPON_NOT_APPLICABLE: "This coupon does not discount anything in this cart.",
    COUPON_NO_CART_BENEFIT: "This coupon has no cart discount rules.",
    COUPON_NOT_WITH_BUNDLE: "Coupons cannot be used with Buy X Get Y offers.",
    COUPON_NOT_AFTER_AUTO: "This coupon cannot be combined with the automatic cart discount.",
    COUPON_NOT_WITH_SKU: "This coupon cannot be combined with product sale prices.",
    COUPON_NOT_WITH_AUTO_CART: "This category coupon cannot be used with the automatic cart discount.",
    COUPON_NO_MATCHING_ITEMS: "None of the products in your cart are in this coupon's categories.",
    COUPON_RULE_SUBTOTAL_NOT_MET: "Your order is below the amount this discount needs.",
    EMPTY_CART_WITH_COUPON: "Add items to your cart before applying a coupon."
  };
  return messages[code] ?? "This coupon cannot be applied to this cart.";
}

/**
 * Reason shown when a coupon is rejected. Includes the rupee amount when the rule has one.
 * @param {string} code
 * @param {{ minSubtotalMinor?: unknown, cartSubtotalMinor?: unknown, eligibilityDays?: unknown, ruleMinSubtotalMinor?: unknown }} [ctx]
 */
export function couponFailureMessage(code, ctx = {}) {
  if (code === "MIN_SUBTOTAL_NOT_MET") {
    const min = Number(ctx.minSubtotalMinor);
    const cart = Number(ctx.cartSubtotalMinor);
    if (Number.isFinite(min) && min > 0 && Number.isFinite(cart) && cart < min) {
      return `Add ${rupeeFromMinor(min - cart)} more. This coupon needs an order of at least ${rupeeFromMinor(min)}.`;
    }
    if (Number.isFinite(min) && min > 0) {
      return `This coupon needs an order of at least ${rupeeFromMinor(min)}.`;
    }
  }
  if (code === "NEW_CUSTOMER_ONLY_NOT_MET") {
    const days = Number(ctx.eligibilityDays);
    if (Number.isFinite(days) && days > 0) {
      return `This coupon is only for customers who joined in the last ${Math.floor(days)} days.`;
    }
  }
  if (code === "COUPON_RULE_SUBTOTAL_NOT_MET") {
    const min = Number(ctx.ruleMinSubtotalMinor);
    if (Number.isFinite(min) && min > 0) {
      return `This discount starts when the order is at least ${rupeeFromMinor(min)}.`;
    }
  }
  return mapCouponReasonMessage(code);
}

/**
 * Why a coupon matched the shop but discounted ₹0.
 * @param {object[]} rules
 * @param {number} subtotalMinor
 * @returns {{ code: string, message: string }}
 */
export function couponZeroDiscountFailure(rules, subtotalMinor) {
  const list = Array.isArray(rules) ? rules : [];
  const subtotal = Math.max(0, Number(subtotalMinor) || 0);
  /** @type {number[]} */
  const thresholds = [];
  let categoryRule = false;
  for (const rule of list) {
    if (!rule || typeof rule !== "object") continue;
    const kind = rule.rule_kind ?? rule.kind;
    if (kind === "category_percent_off") categoryRule = true;
    if (kind === "cart_percent_off_if_subtotal_above" || kind === "cart_fixed_off_if_subtotal_above") {
      const threshold = Number(rule.min_subtotal_minor ?? rule.minSubtotalMinor);
      if (Number.isFinite(threshold) && threshold > subtotal) thresholds.push(threshold);
    }
  }
  if (thresholds.length) {
    const need = Math.min(...thresholds);
    return {
      code: "COUPON_RULE_SUBTOTAL_NOT_MET",
      message: couponFailureMessage("COUPON_RULE_SUBTOTAL_NOT_MET", { ruleMinSubtotalMinor: need })
    };
  }
  if (categoryRule) {
    return {
      code: "COUPON_NO_MATCHING_ITEMS",
      message: mapCouponReasonMessage("COUPON_NO_MATCHING_ITEMS")
    };
  }
  return {
    code: "COUPON_NOT_APPLICABLE",
    message: mapCouponReasonMessage("COUPON_NOT_APPLICABLE")
  };
}
