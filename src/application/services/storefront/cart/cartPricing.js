import {
  mapCouponReasonMessage,
  normalizeCouponCode,
  parseBillableCartQuantity
} from "./cartLineRules.js";
import { collectNormalizedCouponCodes } from "../../promotions/priceStorefrontLines.js";

export function createCartPricing({ priceStorefrontLines }) {
  async function runPricing(client, shopId, customerId, items, couponCode, couponCodes) {
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

    const codes = collectNormalizedCouponCodes({ couponCode, couponCodes });
    const primary = codes[0] ?? normalizeCouponCode(couponCode);

    const priced = await priceStorefrontLines(client, {
      shopId,
      customerId,
      couponCode: primary,
      couponCodes: codes.length > 1 ? codes : undefined,
      lines: billableLines,
      ...(codes.length ? { invalidCouponBehavior: "omit" } : {})
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
          auto_cart_discount_minor: 0,
          has_sku_promo: false,
          has_bundle: false,
          has_auto_cart: false
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
    const autoCartDiscountMinor = Number(priced.autoCartDiscountMinor ?? 0);

    let couponStatus = "none";
    let reasonCode = null;
    let reasonMessage = null;
    let discountMinor = 0;
    const code = normalizedCoupon || priced.couponCodeNormalized || null;

    if (code && couponError && !priced.coupon) {
      couponStatus = "not_applicable";
      reasonCode = couponError.code;
      reasonMessage = couponError.message;
    } else if (priced.coupon) {
      couponStatus = "applied";
      discountMinor = Number(priced.couponDiscountMinor ?? priced.coupon.discountMinor ?? 0);
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
        auto_cart_discount_minor: autoCartDiscountMinor,
        has_sku_promo: linePromoDiscountMinor > 0,
        has_bundle: bundleDiscountMinor > 0,
        has_auto_cart: autoCartDiscountMinor > 0
      },
      coupon: {
        code: priced.couponCodeNormalized ?? code,
        codes: Array.isArray(priced.couponCodesNormalized) ? priced.couponCodesNormalized : undefined,
        status: couponStatus,
        discount_minor: discountMinor,
        reason_code: reasonCode,
        reason_message: reasonMessage
      }
    };
  }

  return { runPricing, buildPromotionBlock };
}
