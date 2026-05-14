/**
 * Purpose: Shared storefront coupon eligibility (list + detail) so rules stay aligned.
 *
 * @param {{
 *   minSubtotalMinor: unknown,
 *   firstOrderOnly: unknown,
 *   newCustomerOnly: unknown
 * }} coupon
 * @param {{
 *   deliveredCount: unknown,
 *   customerCreatedAt: Date,
 *   newCustomerCutoff: Date,
 *   cartSubtotalMinor: number | null
 * }} ctx
 * @returns {{ applicable: boolean, ineligibilityCodes: string[] }}
 */
export function buildCouponEligibility(coupon, ctx) {
  const minSub = coupon.minSubtotalMinor != null ? Number(coupon.minSubtotalMinor) : null;
  const firstOrderOnly = coupon.firstOrderOnly === true;
  const newCustomerOnly = coupon.newCustomerOnly === true;

  /** @type {string[]} */
  const ineligibilityCodes = [];

  if (firstOrderOnly && Number(ctx.deliveredCount) > 0) {
    ineligibilityCodes.push("FIRST_ORDER_ONLY_NOT_MET");
  }
  if (newCustomerOnly && ctx.customerCreatedAt < ctx.newCustomerCutoff) {
    ineligibilityCodes.push("NEW_CUSTOMER_ONLY_NOT_MET");
  }
  if (minSub != null && minSub >= 0) {
    const cart = ctx.cartSubtotalMinor;
    if (cart == null || Number.isNaN(Number(cart))) {
      ineligibilityCodes.push("MIN_SUBTOTAL_NOT_MET");
    } else if (Number(cart) < minSub) {
      ineligibilityCodes.push("MIN_SUBTOTAL_NOT_MET");
    }
  }

  const applicable = ineligibilityCodes.length === 0;
  return {
    applicable,
    ineligibilityCodes: applicable ? [] : ineligibilityCodes
  };
}
