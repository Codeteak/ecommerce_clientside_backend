import { AppError } from "../../../domain/errors/AppError.js";
import { buildCouponEligibility } from "./couponEligibility.js";
import { evaluateBundleDiscounts } from "./evaluateBundleDiscounts.js";
import { evaluateCartPromotionRules } from "./evaluatePromotionRules.js";
import {
  buildStorefrontListingUnitPriceMap,
  computeStorefrontUnitPricing,
  minorToApiString,
  parseMinor
} from "./resolveStorefrontSkuUnitPrices.js";

function pricingError(code, message) {
  return new AppError(message, { statusCode: 400, code });
}

function normalizeCouponCode(code) {
  if (typeof code !== "string") return null;
  const trimmed = code.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

/**
 * @param {{
 *   promotionRepo: import("../../ports/repositories/PromotionRepo.js").PromotionRepo,
 *   shopPromotionCache?: ReturnType<import("../../../infra/cache/shopPromotionCache.js").createShopPromotionCache>,
 *   authRepo?: import("../../ports/repositories/CustomerAuthRepo.js").CustomerAuthRepo,
 *   orderRepo?: import("../../ports/repositories/OrderRepo.js").OrderRepo
 * }} deps
 */
export function createPriceStorefrontLines({ promotionRepo, shopPromotionCache, authRepo, orderRepo }) {
  const promoReads = shopPromotionCache ?? promotionRepo;
  /**
   * @param {import("pg").PoolClient} client
   * @param {{
   *   shopId: string,
   *   customerId?: string,
   *   lines: Array<{
   *     cartItemId?: string,
   *     productId: string,
   *     quantity: number,
   *     listMinor: unknown,
   *     offerMinor?: unknown,
   *     categoryId?: string | null
   *   }>,
   *   couponCode?: string | null,
   *   invalidCouponBehavior?: "throw" | "omit"
   * }} input
   * When invalidCouponBehavior is "omit", invalid coupons return couponRejected on the result instead of throwing (cart preview). Checkout omits this flag so invalid coupons still throw.
   */
  return async function priceStorefrontLines(client, input) {
    const shopId = String(input.shopId);
    const linesIn = Array.isArray(input.lines) ? input.lines : [];
    const couponCode = normalizeCouponCode(input.couponCode ?? null);
    const couponErrorMode = input.invalidCouponBehavior === "omit" ? "omit" : "throw";

    if (couponCode && linesIn.length === 0) {
      throw pricingError("EMPTY_CART_WITH_COUPON", "Cannot apply a coupon to an empty cart.");
    }

    const settings = await promoReads.getShopPromotionSettings(client, shopId);
    const promotionsPaused = settings?.promotions_paused === true;
    const defaultOverlapMode = settings?.default_overlap_mode ?? "priority";
    const allowCombineAutoCampaigns = settings?.allow_combine_auto_campaigns !== false;

    const productIds = [...new Set(linesIn.map((l) => String(l.productId)).filter(Boolean))];

    const [overlays, bundleRulesRaw] = await Promise.all([
      promotionsPaused || !productIds.length
        ? []
        : promoReads.listActivePromotionProductOverlaysForShopProducts(client, shopId, productIds),
      promotionsPaused ? [] : promoReads.listActiveBundleRulesForShop(client, shopId)
    ]);

    /** @type {Map<string, unknown[]>} */
    const overlaysByProductId = new Map();
    for (const o of overlays || []) {
      const pid = String(o.shop_product_id);
      if (!overlaysByProductId.has(pid)) overlaysByProductId.set(pid, []);
      overlaysByProductId.get(pid).push(o);
    }

    const priceMap = buildStorefrontListingUnitPriceMap({
      promotionsPaused,
      defaultOverlapMode,
      products: linesIn.map((l) => ({
        id: String(l.productId),
        price_minor_per_unit: l.listMinor,
        offer_price_minor_per_unit: l.offerMinor
      })),
      overlays
    });

    /** @type {import("./evaluateBundleDiscounts.js").PricedLine[]} */
    const pricedLines = [];
    /** @type {string[]} */
    const appliedPromotionIds = [];
    /** @type {Map<string, number>} */
    const appliedPromotionDiscounts = new Map();

    let subtotalBeforeCoupon = 0;
    let linePromoDiscountTotal = 0;

    for (const line of linesIn) {
      const productId = String(line.productId);
      const qty = Math.max(0, Math.trunc(Number(line.quantity)));
      const promoPriceMinor = priceMap.get(productId)?.promoPriceMinor ?? null;
      const unit = computeStorefrontUnitPricing(line.listMinor, line.offerMinor ?? null, promoPriceMinor);
      const lineTotalMinor = Math.round(qty * unit.finalMinor);
      const compareLineTotal = Math.round(qty * unit.compareAtMinor);
      const lineDiscountMinor = Math.max(0, compareLineTotal - lineTotalMinor);

      subtotalBeforeCoupon += lineTotalMinor;
      linePromoDiscountTotal += lineDiscountMinor;

      /** @type {string[]} */
      const linePromoIds = [];
      if (promoPriceMinor != null) {
        const candidates = overlaysByProductId.get(productId) ?? [];
        const winner = candidates.find((o) => parseMinor(o.promo_price_minor_per_unit) === promoPriceMinor);
        if (winner?.promotion_id) {
          const promotionId = String(winner.promotion_id);
          linePromoIds.push(promotionId);
          if (!appliedPromotionIds.includes(promotionId)) {
            appliedPromotionIds.push(promotionId);
          }
          const discountMinor = Math.max(0, Math.round(qty * unit.promoDiscountMinor));
          if (discountMinor > 0) {
            appliedPromotionDiscounts.set(
              promotionId,
              (appliedPromotionDiscounts.get(promotionId) ?? 0) + discountMinor
            );
          }
        }
      }

      pricedLines.push({
        cartItemId: line.cartItemId,
        productId,
        categoryId: line.categoryId ?? null,
        quantity: qty,
        unitFinalMinor: unit.finalMinor,
        lineTotalMinor,
        listMinor: unit.listMinor,
        compareAtMinor: unit.compareAtMinor,
        offerDiscountMinor: unit.offerDiscountMinor,
        promoDiscountMinor: unit.promoDiscountMinor,
        totalDiscountMinor: unit.totalDiscountMinor,
        appliedPromotionIds: linePromoIds
      });
    }

    const { bundleDiscountMinor, appliedByPromotion } = evaluateBundleDiscounts(pricedLines, bundleRulesRaw, {
      allowCombineAutoCampaigns
    });
    for (const pid of appliedByPromotion.keys()) {
      if (!appliedPromotionIds.includes(pid)) appliedPromotionIds.push(pid);
      const discountMinor = Number(appliedByPromotion.get(pid)) || 0;
      if (discountMinor > 0) {
        appliedPromotionDiscounts.set(pid, (appliedPromotionDiscounts.get(pid) ?? 0) + discountMinor);
      }
    }

    const subtotalAfterBundles = pricedLines.reduce((s, l) => s + (l.linePayableMinor ?? l.lineTotalMinor), 0);

    let couponDiscountMinor = 0;
    /** @type {string | null} */
    let couponCodeNormalized = null;
    /** @type {string | null} */
    let couponId = null;
    /** @type {string | null} */
    let couponPromotionId = null;
    /** @type {{ code: string, message: string } | null} */
    let couponRejected = null;

    if (couponCode && !promotionsPaused) {
      try {
        const couponRow = await promotionRepo.findCouponByCodeForShop(
          client,
          shopId,
          couponCode,
          input.customerId ?? null
        );
        if (!couponRow) {
          throw pricingError("COUPON_NOT_FOUND", "Coupon code is not valid.");
        }
        if (couponRow.has_sku_products && !couponRow.has_coupon_rules) {
          throw pricingError("COUPON_NOT_APPLICABLE", "This code cannot be applied at checkout.");
        }
        if (!couponRow.has_coupon_rules) {
          throw pricingError("COUPON_NO_CART_BENEFIT", "This coupon has no cart discount rules.");
        }

        const customerId = input.customerId != null ? String(input.customerId) : null;
        if (customerId && authRepo && orderRepo) {
          const [customerRow, deliveredCount] = await Promise.all([
            authRepo.getCustomerCreatedAtById(client, customerId),
            orderRepo.countDeliveredOrdersForCustomer(client, shopId, customerId)
          ]);
          const eligibilityDays = Number(settings?.first_coupon_eligibility_days ?? 30);
          const ms = Math.max(0, eligibilityDays) * 24 * 60 * 60 * 1000;
          const newCustomerCutoff = new Date(Date.now() - ms);
          const eligibility = buildCouponEligibility(
            {
              minSubtotalMinor: couponRow.min_subtotal_minor,
              firstOrderOnly: couponRow.first_order_only,
              newCustomerOnly: couponRow.new_customer_only
            },
            {
              deliveredCount,
              customerCreatedAt: customerRow?.created_at ? new Date(customerRow.created_at) : new Date(0),
              newCustomerCutoff,
              cartSubtotalMinor: subtotalAfterBundles
            }
          );
          if (!eligibility.applicable) {
            const code = eligibility.ineligibilityCodes[0] || "COUPON_NOT_APPLICABLE";
            throw pricingError(code, "Coupon cannot be applied to this order.");
          }
        }

        const totalLimit = couponRow.max_redemptions_total;
        const perCustomerLimit = couponRow.max_redemptions_per_customer;
        if (typeof totalLimit === "number" && Number(couponRow.total_redemptions) >= totalLimit) {
          throw pricingError("COUPON_EXHAUSTED", "This coupon has reached its redemption limit.");
        }
        if (
          customerId &&
          typeof perCustomerLimit === "number" &&
          Number(couponRow.customer_redemptions) >= perCustomerLimit
        ) {
          throw pricingError("COUPON_EXHAUSTED", "You have already used this coupon the maximum number of times.");
        }

        const rules = Array.isArray(couponRow.promotion_rules) ? couponRow.promotion_rules : [];
        couponDiscountMinor = evaluateCartPromotionRules(rules, {
          subtotalMinor: subtotalAfterBundles,
          lines: pricedLines.map((l) => ({
            lineTotalMinor: l.linePayableMinor ?? l.lineTotalMinor,
            categoryId: l.categoryId
          }))
        });
        couponDiscountMinor = Math.min(couponDiscountMinor, subtotalAfterBundles);

        couponCodeNormalized = couponRow.code_normalized;
        couponId = String(couponRow.id);
        couponPromotionId = String(couponRow.promotion_id);
        if (!appliedPromotionIds.includes(couponPromotionId)) {
          appliedPromotionIds.push(couponPromotionId);
        }
      } catch (err) {
        if (!(err instanceof AppError)) {
          throw err;
        }
        if (couponErrorMode !== "omit") {
          throw err;
        }
        couponRejected = {
          code: err.code || "COUPON_NOT_APPLICABLE",
          message: err.message || "Coupon cannot be applied to this order."
        };
      }
    }

    const promotionDiscountTotalMinor =
      linePromoDiscountTotal + bundleDiscountMinor + couponDiscountMinor;
    const payableSubtotalMinor = Math.max(0, subtotalAfterBundles - couponDiscountMinor);

    return {
      promotionsPaused,
      lines: pricedLines.map((l) => {
        const paid = l.paidQuantity ?? l.quantity;
        const free = l.freeQuantity ?? 0;
        const display = l.displayQuantity ?? paid + free;
        return {
          cartItemId: l.cartItemId,
          productId: l.productId,
          quantity: paid,
          paid_quantity: paid,
          free_quantity: free,
          display_quantity: display,
          list_price_minor: minorToApiString(l.listMinor),
          total_price_minor: minorToApiString(l.compareAtMinor),
          final_price_minor: minorToApiString(l.unitFinalMinor),
          line_subtotal_before_bundle_minor: minorToApiString(l.lineTotalMinor),
          bundle_discount_minor: minorToApiString(l.bundleDiscountMinor ?? 0),
          line_total_minor: minorToApiString(l.linePayableMinor ?? l.lineTotalMinor),
          offer_discount_minor: minorToApiString(l.offerDiscountMinor),
          promo_discount_minor: minorToApiString(l.promoDiscountMinor),
          total_discount_minor: minorToApiString(l.totalDiscountMinor),
          applied_promotion_ids: [...l.appliedPromotionIds]
        };
      }),
      subtotalBeforeBundleMinor: subtotalBeforeCoupon,
      subtotalMinor: payableSubtotalMinor,
      subtotalBeforeCouponMinor: subtotalAfterBundles,
      linePromoDiscountMinor: linePromoDiscountTotal,
      bundleDiscountMinor,
      couponDiscountMinor,
      promotionDiscountTotalMinor,
      appliedPromotionIds,
      appliedPromotionDiscounts: [...appliedPromotionDiscounts.entries()].map(
        ([promotionId, discountMinor]) => ({
          promotionId,
          discountMinor
        })
      ),
      coupon: couponCodeNormalized
        ? {
            id: couponId,
            code: couponCodeNormalized,
            promotionId: couponPromotionId,
            discountMinor: couponDiscountMinor
          }
        : null,
      ...(couponRejected ? { couponRejected } : {})
    };
  };
}

