import { evaluateCartPromotionRules } from "../promotions/evaluatePromotionRules.js";

/**
 * Score applicable coupons by estimated cart discount (best-coupon), take top N.
 *
 * @param {Array<{
 *   code: string,
 *   eligibility?: { applicable?: boolean, ineligibilityCodes?: string[] },
 *   benefits?: Array<Record<string, unknown>>,
 *   promotionRules?: unknown
 * }>} coupons
 * @param {{
 *   subtotalMinor: number,
 *   lines?: Array<{ lineTotalMinor: number, categoryId?: string | null }>
 * }} pricingCtx
 * @param {number} [limit=3]
 * @returns {Array<{ code: string, applicable: boolean, reason_codes: string[], estimated_discount_minor: number }>}
 */
export function rankSuggestedCouponsByDiscount(coupons, pricingCtx, limit = 3) {
  const subtotalMinor = Math.max(0, Math.trunc(Number(pricingCtx?.subtotalMinor) || 0));
  const lines = Array.isArray(pricingCtx?.lines) ? pricingCtx.lines : [];
  const ctx = { subtotalMinor, lines };

  const scored = (Array.isArray(coupons) ? coupons : [])
    .filter((c) => c && typeof c.code === "string" && c.code.trim())
    .map((c) => {
      const applicable = c.eligibility?.applicable !== false;
      const rules = Array.isArray(c.promotionRules)
        ? c.promotionRules
        : Array.isArray(c.benefits)
          ? c.benefits.map((b) => ({
              rule_kind: b.kind ?? b.rule_kind,
              percent_bps: b.percentBps ?? b.percent_bps,
              amount_minor: b.amountMinor ?? b.amount_minor,
              min_subtotal_minor: b.minSubtotalMinor ?? b.min_subtotal_minor,
              global_category_id: b.globalCategoryId ?? b.global_category_id,
              max_discount_minor: b.maxDiscountMinor ?? b.max_discount_minor
            }))
          : [];
      const estimated = applicable
        ? Math.min(subtotalMinor, evaluateCartPromotionRules(rules, ctx))
        : 0;
      return {
        code: String(c.code).trim().toUpperCase(),
        applicable,
        reason_codes: c.eligibility?.ineligibilityCodes ?? [],
        estimated_discount_minor: estimated
      };
    })
    .sort((a, b) => {
      if (b.estimated_discount_minor !== a.estimated_discount_minor) {
        return b.estimated_discount_minor - a.estimated_discount_minor;
      }
      return a.code.localeCompare(b.code);
    });

  return scored.slice(0, Math.max(0, Number(limit) || 3)).map(({ estimated_discount_minor: _e, ...rest }) => rest);
}
