import { AppError } from "../../../domain/errors/AppError.js";
import { buildCouponEligibility } from "./couponEligibility.js";
import { evaluateAutoCartRules } from "./evaluateAutoCartRules.js";
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
 * Merge couponCode + couponCodes into a unique uppercase list (order preserved).
 * @param {{ couponCode?: string | null, couponCodes?: unknown }} input
 * @returns {string[]}
 */
export function collectNormalizedCouponCodes(input) {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  const push = (raw) => {
    const n = normalizeCouponCode(raw);
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  push(input?.couponCode ?? null);
  if (Array.isArray(input?.couponCodes)) {
    for (const c of input.couponCodes) push(c);
  }
  return out;
}

function resolveStackFlag(campaignValue, shopDefault) {
  if (campaignValue === true || campaignValue === false) return campaignValue;
  return shopDefault === true;
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
   *   couponCodes?: string[] | null,
   *   invalidCouponBehavior?: "throw" | "omit"
   * }} input
   * When invalidCouponBehavior is "omit", invalid coupons return couponRejected on the result instead of throwing (cart preview). Checkout omits this flag so invalid coupons still throw.
   */
  return async function priceStorefrontLines(client, input) {
    const shopId = String(input.shopId);
    const linesIn = Array.isArray(input.lines) ? input.lines : [];
    const requestedCodes = collectNormalizedCouponCodes(input);
    const couponErrorMode = input.invalidCouponBehavior === "omit" ? "omit" : "throw";

    if (requestedCodes.length > 0 && linesIn.length === 0) {
      throw pricingError("EMPTY_CART_WITH_COUPON", "Cannot apply a coupon to an empty cart.");
    }

    const settings = await promoReads.getShopPromotionSettings(client, shopId);
    const promotionsPaused = settings?.promotions_paused === true;
    const defaultOverlapMode = settings?.default_overlap_mode ?? "priority";
    const allowCombineAutoCampaigns = settings?.allow_combine_auto_campaigns !== false;
    const shopAllowCouponAfterAuto = settings?.default_allow_coupon_after_auto !== false;
    const shopStackSkuWithCart = settings?.default_stack_sku_with_cart === true;
    const shopStackCategoryWithCart = settings?.default_stack_category_with_cart === true;
    const maxCouponsPerOrder = Math.max(
      1,
      Math.min(10, Number(settings?.max_coupons_per_order ?? 1) || 1)
    );
    const codesToTry = requestedCodes.slice(0, maxCouponsPerOrder);

    const productIds = [...new Set(linesIn.map((l) => String(l.productId)).filter(Boolean))];

    const [overlays, bundleRulesRaw, autoCartRulesRaw] = await Promise.all([
      promotionsPaused || !productIds.length
        ? []
        : promoReads.listActivePromotionProductOverlaysForShopProducts(client, shopId, productIds),
      promotionsPaused ? [] : promoReads.listActiveBundleRulesForShop(client, shopId),
      promotionsPaused
        ? []
        : typeof promoReads.listActiveAutoCartRulesForShop === "function"
          ? promoReads.listActiveAutoCartRulesForShop(client, shopId)
          : promotionRepo.listActiveAutoCartRulesForShop(client, shopId)
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
    let hasSkuPromo = false;

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
        hasSkuPromo = true;
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

    const lineCtx = {
      subtotalMinor: subtotalAfterBundles,
      lines: pricedLines.map((l) => ({
        lineTotalMinor: l.linePayableMinor ?? l.lineTotalMinor,
        categoryId: l.categoryId
      }))
    };

    let autoRulesFiltered = Array.isArray(autoCartRulesRaw) ? [...autoCartRulesRaw] : [];
    if (hasSkuPromo || linePromoDiscountTotal > 0) {
      autoRulesFiltered = autoRulesFiltered.filter((row) => {
        const kind = row.rule_kind ?? row.kind;
        if (kind === "category_percent_off") {
          return resolveStackFlag(row.stack_sku_with_category, settings?.default_stack_sku_with_category === true);
        }
        return resolveStackFlag(row.stack_sku_with_cart, shopStackSkuWithCart);
      });
    }

    const {
      autoCartDiscountMinor: autoCartRaw,
      appliedByPromotion: autoApplied,
      appliedPromotionIds: autoPromoIds
    } = evaluateAutoCartRules(autoRulesFiltered, lineCtx, { allowCombineAutoCampaigns });

    const autoCartDiscountMinor = autoCartRaw;
    for (const pid of autoPromoIds) {
      if (!appliedPromotionIds.includes(pid)) appliedPromotionIds.push(pid);
      const discountMinor = Number(autoApplied.get(pid)) || 0;
      if (discountMinor > 0) {
        appliedPromotionDiscounts.set(pid, (appliedPromotionDiscounts.get(pid) ?? 0) + discountMinor);
      }
    }

    const subtotalAfterAuto = Math.max(0, subtotalAfterBundles - autoCartDiscountMinor);

    let couponDiscountMinor = 0;
    /** @type {string | null} */
    let couponCodeNormalized = null;
    /** @type {string | null} */
    let couponId = null;
    /** @type {string | null} */
    let couponPromotionId = null;
    /** @type {Array<{ id: string, code: string, promotionId: string, discountMinor: number }>} */
    const appliedCoupons = [];
    /** @type {{ code: string, message: string } | null} */
    let couponRejected = null;

    const ruleLines = pricedLines.map((l) => ({
      lineTotalMinor: l.linePayableMinor ?? l.lineTotalMinor,
      categoryId: l.categoryId
    }));

    let remainingSubtotal = subtotalAfterAuto;
    const customerId = input.customerId != null ? String(input.customerId) : null;

    /** @type {{ deliveredCount: number, customerCreatedAt: Date, newCustomerCutoff: Date } | null} */
    let eligibilityBase = null;
    if (customerId && authRepo && orderRepo && codesToTry.length > 0 && !promotionsPaused) {
      const [customerRow, deliveredCount] = await Promise.all([
        authRepo.getCustomerCreatedAtById(client, customerId),
        orderRepo.countDeliveredOrdersForCustomer(client, shopId, customerId)
      ]);
      const eligibilityDays = Number(settings?.first_coupon_eligibility_days ?? 30);
      const ms = Math.max(0, eligibilityDays) * 24 * 60 * 60 * 1000;
      eligibilityBase = {
        deliveredCount,
        customerCreatedAt: customerRow?.created_at ? new Date(customerRow.created_at) : new Date(0),
        newCustomerCutoff: new Date(Date.now() - ms)
      };
    }

    /**
     * @param {string} code
     * @param {number} subtotalForCoupon
     */
    async function applyOneCoupon(code, subtotalForCoupon) {
      if (autoCartDiscountMinor > 0 && shopAllowCouponAfterAuto === false) {
        throw pricingError(
          "COUPON_NOT_AFTER_AUTO",
          "A coupon cannot be combined with the automatic cart discount."
        );
      }

      const couponRow = await promotionRepo.findCouponByCodeForShop(
        client,
        shopId,
        code,
        customerId
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

      const couponAllowAfterAuto = resolveStackFlag(
        couponRow.allow_coupon_after_auto,
        shopAllowCouponAfterAuto
      );
      if (autoCartDiscountMinor > 0 && !couponAllowAfterAuto) {
        throw pricingError(
          "COUPON_NOT_AFTER_AUTO",
          "This coupon cannot be combined with the automatic cart discount."
        );
      }

      const couponStackSkuWithCart = resolveStackFlag(
        couponRow.stack_sku_with_cart,
        shopStackSkuWithCart
      );
      const couponPromotionIdCandidate = String(couponRow.promotion_id);
      const sameCampaignAsSku = appliedPromotionIds.includes(couponPromotionIdCandidate);
      if (hasSkuPromo && !couponStackSkuWithCart && !sameCampaignAsSku) {
        throw pricingError(
          "COUPON_NOT_WITH_SKU",
          "This coupon cannot be combined with product sale prices."
        );
      }

      if (eligibilityBase) {
        const eligibility = buildCouponEligibility(
          {
            minSubtotalMinor: couponRow.min_subtotal_minor,
            firstOrderOnly: couponRow.first_order_only,
            newCustomerOnly: couponRow.new_customer_only
          },
          {
            deliveredCount: eligibilityBase.deliveredCount,
            customerCreatedAt: eligibilityBase.customerCreatedAt,
            newCustomerCutoff: eligibilityBase.newCustomerCutoff,
            cartSubtotalMinor: subtotalForCoupon
          }
        );
        if (!eligibility.applicable) {
          const errCode = eligibility.ineligibilityCodes[0] || "COUPON_NOT_APPLICABLE";
          throw pricingError(errCode, "Coupon cannot be applied to this order.");
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
      const hasCategoryRule = rules.some(
        (r) => (r.rule_kind ?? r.kind) === "category_percent_off"
      );
      if (autoCartDiscountMinor > 0 && hasCategoryRule) {
        const stackCatCart = resolveStackFlag(
          couponRow.stack_category_with_cart,
          shopStackCategoryWithCart
        );
        if (!stackCatCart) {
          throw pricingError(
            "COUPON_NOT_WITH_AUTO_CART",
            "This category coupon cannot stack with the automatic cart discount."
          );
        }
      }

      let discount = evaluateCartPromotionRules(rules, {
        subtotalMinor: subtotalForCoupon,
        lines: ruleLines
      });
      discount = Math.min(discount, subtotalForCoupon);

      return {
        id: String(couponRow.id),
        code: String(couponRow.code_normalized),
        promotionId: couponPromotionIdCandidate,
        discountMinor: discount
      };
    }

    if (codesToTry.length > 0 && !promotionsPaused) {
      for (const code of codesToTry) {
        try {
          const applied = await applyOneCoupon(code, remainingSubtotal);
          appliedCoupons.push(applied);
          couponDiscountMinor += applied.discountMinor;
          remainingSubtotal = Math.max(0, remainingSubtotal - applied.discountMinor);

          if (!couponCodeNormalized) {
            couponCodeNormalized = applied.code;
            couponId = applied.id;
            couponPromotionId = applied.promotionId;
          }
          if (!appliedPromotionIds.includes(applied.promotionId)) {
            appliedPromotionIds.push(applied.promotionId);
          }
          if (applied.discountMinor > 0) {
            appliedPromotionDiscounts.set(
              applied.promotionId,
              (appliedPromotionDiscounts.get(applied.promotionId) ?? 0) + applied.discountMinor
            );
          }
        } catch (err) {
          if (!(err instanceof AppError)) {
            throw err;
          }
          if (couponErrorMode !== "omit") {
            throw err;
          }
          if (!couponRejected) {
            couponRejected = {
              code: err.code || "COUPON_NOT_APPLICABLE",
              message: err.message || "Coupon cannot be applied to this order."
            };
          }
        }
      }
    }

    const promotionDiscountTotalMinor =
      linePromoDiscountTotal + bundleDiscountMinor + autoCartDiscountMinor + couponDiscountMinor;
    const payableSubtotalMinor = Math.max(0, subtotalAfterAuto - couponDiscountMinor);
    const couponCodesNormalized = appliedCoupons.map((c) => c.code);

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
      subtotalBeforeCouponMinor: subtotalAfterAuto,
      subtotalBeforeAutoCartMinor: subtotalAfterBundles,
      linePromoDiscountMinor: linePromoDiscountTotal,
      bundleDiscountMinor,
      autoCartDiscountMinor,
      couponDiscountMinor,
      promotionDiscountTotalMinor,
      appliedPromotionIds,
      appliedPromotionDiscounts: [...appliedPromotionDiscounts.entries()].map(
        ([promotionId, discountMinor]) => ({
          promotionId,
          discountMinor
        })
      ),
      couponCodeNormalized,
      couponId,
      couponPromotionId,
      couponCodesNormalized,
      appliedCoupons,
      coupon: couponCodeNormalized
        ? {
            id: couponId,
            code: couponCodeNormalized,
            promotionId: couponPromotionId,
            discountMinor: appliedCoupons[0]?.discountMinor ?? couponDiscountMinor
          }
        : null,
      ...(couponRejected ? { couponRejected } : {})
    };
  };
}
