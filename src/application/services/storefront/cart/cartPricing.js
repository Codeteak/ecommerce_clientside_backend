import {
  mapCouponReasonMessage,
  normalizeCouponCode,
  parseBillableCartQuantity
} from "./cartLineRules.js";

export function createCartPricing({ priceStorefrontLines }) {
  async function runPricing(client, shopId, customerId, items, couponCode) {
    if (!priceStorefrontLines) {
      return null;
    }

    const billableLines = items
      .filter((it) => it.product_id && !it.is_custom)
      .map((it) => ({
        cartItemId: it.id,
        productId: String(it.product_id),
        quantity: parseBillableCartQuantity(it.quantity),
        listMinor: it.list_price_minor_per_unit ?? it.unit_price_minor,
        offerMinor: it.offer_price_minor_per_unit,
        categoryId: it.global_category_id ?? null
      }));

    const normalizedCoupon = normalizeCouponCode(couponCode);

    const priced = await priceStorefrontLines(client, {
      shopId,
      customerId,
      couponCode: normalizedCoupon,
      lines: billableLines,
      ...(normalizedCoupon ? { invalidCouponBehavior: "omit" } : {})
    });
    if (!priced) {
      return null;
    }
    if (priced.couponRejected) {
      return {
        priced,
        couponError: {
          code: priced.couponRejected.code,
          message: priced.couponRejected.message || mapCouponReasonMessage(priced.couponRejected.code)
        }
      };
    }
    return { priced, couponError: null };
  }

  function buildPromotionBlock(priced, couponCode, couponError) {
    const normalizedCoupon = normalizeCouponCode(couponCode);

    if (!priced) {
      return {
        paused: false,
        auto: {
          applied_promotion_ids: [],
          bundle_discount_minor: 0,
          line_promo_discount_minor: 0,
          has_sku_promo: false,
          has_bundle: false
        },
        coupon: {
          code: normalizedCoupon,
          status: "none",
          discount_minor: 0,
          reason_code: null,
          reason_message: null
        },
        suggested_coupons: []
      };
    }

    const bundleDiscountMinor = Number(priced.bundleDiscountMinor ?? 0);
    const linePromoDiscountMinor = Number(priced.linePromoDiscountMinor ?? 0);

    let couponStatus = "none";
    let reasonCode = null;
    let reasonMessage = null;
    let discountMinor = 0;
    const code = normalizedCoupon;

    if (code && couponError) {
      couponStatus = "not_applicable";
      reasonCode = couponError.code;
      reasonMessage = couponError.message;
    } else if (code && priced.coupon) {
      couponStatus = "applied";
      discountMinor = Number(priced.coupon.discountMinor ?? priced.couponDiscountMinor ?? 0);
    } else if (code) {
      couponStatus = "not_applicable";
      reasonCode = "COUPON_NOT_APPLICABLE";
      reasonMessage = mapCouponReasonMessage(reasonCode);
    }

    return {
      paused: priced.promotionsPaused === true,
      auto: {
        applied_promotion_ids: Array.isArray(priced.appliedPromotionIds) ? priced.appliedPromotionIds : [],
        bundle_discount_minor: bundleDiscountMinor,
        line_promo_discount_minor: linePromoDiscountMinor,
        has_sku_promo: linePromoDiscountMinor > 0,
        has_bundle: bundleDiscountMinor > 0
      },
      coupon: {
        code,
        status: couponStatus,
        discount_minor: discountMinor,
        reason_code: reasonCode,
        reason_message: reasonMessage
      }
    };
  }

  return { runPricing, buildPromotionBlock };
}
