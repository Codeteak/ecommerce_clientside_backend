/**
 * Shop-level minimum purchase: payable goods subtotal after discounts,
 * before delivery. 0 = no minimum.
 */
import { AppError } from "../errors/AppError.js";

export const MIN_PURCHASE_NOT_MET = "MIN_PURCHASE_NOT_MET";

export function parseMinPurchaseMinor(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function remainingMinPurchaseMinor(minPurchaseMinor, subtotalMinor) {
  const min = parseMinPurchaseMinor(minPurchaseMinor);
  if (min <= 0) return 0;
  const subtotal = parseMinPurchaseMinor(subtotalMinor);
  return Math.max(0, min - subtotal);
}

export function formatInrFromMinor(minor) {
  const n = parseMinPurchaseMinor(minor);
  const rupees = n / 100;
  if (Number.isInteger(rupees)) {
    return `₹${rupees.toLocaleString("en-IN")}`;
  }
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function minPurchaseUserMessage({ minPurchaseMinor, remainingMinor }) {
  return `Add ${formatInrFromMinor(remainingMinor)} more to meet this shop's ${formatInrFromMinor(minPurchaseMinor)} minimum order.`;
}

/**
 * @param {{ minPurchaseMinor?: unknown, subtotalMinor?: unknown }} input
 * @returns {{ minPurchaseMinor: number, remainingMinor: number }}
 */
export function assertMinPurchaseMet({ minPurchaseMinor, subtotalMinor }) {
  const min = parseMinPurchaseMinor(minPurchaseMinor);
  const remaining = remainingMinPurchaseMinor(min, subtotalMinor);
  if (remaining <= 0) {
    return { minPurchaseMinor: min, remainingMinor: 0 };
  }
  throw new AppError(minPurchaseUserMessage({ minPurchaseMinor: min, remainingMinor: remaining }), {
    statusCode: 400,
    code: MIN_PURCHASE_NOT_MET,
    details: {
      minPurchaseMinor: min,
      subtotalMinor: parseMinPurchaseMinor(subtotalMinor),
      remainingMinor: remaining
    }
  });
}
