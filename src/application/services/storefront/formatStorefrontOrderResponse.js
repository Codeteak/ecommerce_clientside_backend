/**
 * Purpose: Normalizes storefront order rows for API responses (amounts, promo/coupon fields).
 */

export function toMinorInt(value) {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * @param {Record<string, unknown> | null | undefined} row
 */
export function mapStorefrontOrderRow(row) {
  if (!row) return null;

  const subtotal = toMinorInt(row.subtotal_minor);
  const promotionDiscount = toMinorInt(row.promotion_discount_total_minor);
  const couponDiscount = toMinorInt(row.coupon_discount_minor);
  const autoPromotionDiscount = Math.max(0, promotionDiscount - couponDiscount);
  const couponCode =
    typeof row.coupon_code_normalized === "string"
      ? row.coupon_code_normalized
      : typeof row.coupon_code === "string"
        ? row.coupon_code
        : null;

  return {
    ...row,
    subtotal_minor: subtotal,
    delivery_fee_minor: toMinorInt(row.delivery_fee_minor),
    total_minor: toMinorInt(row.total_minor),
    promotion_discount_total_minor: promotionDiscount,
    promotion_discount_minor: promotionDiscount,
    coupon_discount_minor: couponDiscount,
    auto_promotion_discount_minor: autoPromotionDiscount,
    subtotal_before_coupon_minor: subtotal + couponDiscount,
    coupon_code: couponCode
  };
}
