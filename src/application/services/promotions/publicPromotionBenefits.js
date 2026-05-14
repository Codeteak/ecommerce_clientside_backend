const ALLOWED_RULE_KINDS = new Set([
  "cart_percent_off",
  "cart_fixed_off",
  "cart_fixed_off_if_subtotal_above",
  "cart_percent_off_if_subtotal_above",
  "category_percent_off"
]);

/**
 * Maps DB promotion_rules JSON rows to a customer-safe benefit list (no ids, no staff fields).
 *
 * @param {unknown} raw
 * @returns {Array<{ kind: string, percentBps?: number, amountMinor?: number, minSubtotalMinor?: number }>}
 */
export function mapPublicPromotionBenefits(raw) {
  const list = Array.isArray(raw) ? raw : [];
  /** @type {Array<{ kind: string, percentBps?: number, amountMinor?: number, minSubtotalMinor?: number }>} */
  const out = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const kind = /** @type {{ kind?: unknown }} */ (row).kind;
    if (typeof kind !== "string" || !ALLOWED_RULE_KINDS.has(kind)) continue;

    /** @type {{ kind: string, percentBps?: number, amountMinor?: number, minSubtotalMinor?: number }} */
    const benefit = { kind };
    const percentBps = readOptionalInt(row, "percentBps");
    const amountMinor = readOptionalInt(row, "amountMinor");
    const minSubtotalMinor = readOptionalInt(row, "minSubtotalMinor");
    if (percentBps != null) benefit.percentBps = percentBps;
    if (amountMinor != null) benefit.amountMinor = amountMinor;
    if (minSubtotalMinor != null) benefit.minSubtotalMinor = minSubtotalMinor;
    out.push(benefit);
  }
  return out;
}

/** @param {object} row @param {string} key */
function readOptionalInt(row, key) {
  const v = /** @type {Record<string, unknown>} */ (row)[key];
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
