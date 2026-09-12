import { buildCouponEligibility } from "./couponEligibility.js";
import { mapPublicPromotionBenefits } from "./publicPromotionBenefits.js";

/**
 * Purpose: List customer-visible coupons for the current shop context with
 * eligibility hints aligned to shop_promotion_settings and promotion_coupons.
 *
 * @param {{
 *   promotionRepo: import("../../ports/repositories/PromotionRepo.js").PromotionRepo,
 *   shopPromotionCache?: ReturnType<import("../../../infra/cache/shopPromotionCache.js").createShopPromotionCache>,
 *   authRepo: import("../../ports/repositories/CustomerAuthRepo.js").CustomerAuthRepo,
 *   orderRepo: import("../../ports/repositories/OrderRepo.js").OrderRepo
 * }} deps
 */
export function createListApplicableCoupons({ promotionRepo, shopPromotionCache, authRepo, orderRepo }) {
  const defaultSettings = {
    promotions_paused: false,
    first_coupon_eligibility_days: 30,
    max_coupons_per_order: 1,
    allow_combine_auto_campaigns: true
  };

  /**
   * @param {import("pg").PoolClient} client
   * @param {{ shopId: string, customerId?: string | null, code?: string | null, cartSubtotalMinor?: number | null, onlyApplicable?: boolean, limit?: number | null }} input
   */
  return async function listApplicableCoupons(client, {
    shopId,
    customerId = null,
    code = null,
    cartSubtotalMinor = null,
    onlyApplicable = false,
    limit = null
  }) {
    const normalizedCode = normalizeCouponCode(code);
    const rawSettings = shopPromotionCache
      ? await shopPromotionCache.getShopPromotionSettings(client, shopId)
      : await promotionRepo.getShopPromotionSettings(client, shopId);
    const settings = { ...defaultSettings, ...(rawSettings || {}) };
    const promotionsPaused = settings.promotions_paused === true;

    const publicSettings = {
      maxCouponsPerOrder: Number(settings.max_coupons_per_order ?? defaultSettings.max_coupons_per_order),
      allowCombineAutoCampaigns: Boolean(settings.allow_combine_auto_campaigns ?? defaultSettings.allow_combine_auto_campaigns),
      firstCouponEligibilityDays: Number(settings.first_coupon_eligibility_days ?? defaultSettings.first_coupon_eligibility_days)
    };

    if (promotionsPaused) {
      return {
        promotionsPaused: true,
        settings: publicSettings,
        coupons: []
      };
    }

    const custKey =
      customerId != null && String(customerId).trim() !== "" ? String(customerId).trim() : null;

    let customerCreatedAt = new Date(0);
    let deliveredCount = 0;
    let hasCustomerContext = false;

    if (custKey) {
      const [customerRow, count] = await Promise.all([
        authRepo.getCustomerCreatedAtById(client, custKey),
        orderRepo.countDeliveredOrdersForCustomer(client, shopId, custKey)
      ]);
      if (!customerRow?.created_at) {
        return {
          promotionsPaused: false,
          settings: publicSettings,
          coupons: []
        };
      }
      customerCreatedAt = new Date(customerRow.created_at);
      deliveredCount = count;
      hasCustomerContext = true;
    }

    const eligibilityDays = publicSettings.firstCouponEligibilityDays;
    const ms = Math.max(0, eligibilityDays) * 24 * 60 * 60 * 1000;
    const newCustomerCutoff = new Date(Date.now() - ms);

    const repoLimit =
      limit != null && onlyApplicable
        ? Math.min(50, Math.max(Number(limit) * 5, 20))
        : limit != null
          ? Math.min(50, Number(limit))
          : null;

    const rows = shopPromotionCache
      ? await shopPromotionCache.listShopCouponCatalogRows(client, shopId, normalizedCode, {
          limit: repoLimit
        })
      : custKey
        ? await promotionRepo.listEligibleCouponsWithUsage(
            client,
            shopId,
            custKey,
            normalizedCode,
            { limit: repoLimit }
          )
        : await promotionRepo.listEligibleCouponDefinitions(client, shopId, normalizedCode, {
            limit: repoLimit
          });

    let redemptionByCoupon = new Map();
    if (rows.length > 0) {
      const couponIds = rows.map((r) => String(r.id));
      if (shopPromotionCache || !custKey) {
        redemptionByCoupon = await promotionRepo.getCouponRedemptionCounts(
          client,
          shopId,
          couponIds,
          custKey
        );
      }
    }

    const eligibilityCtx = {
      deliveredCount,
      customerCreatedAt,
      newCustomerCutoff,
      cartSubtotalMinor
    };

    let coupons = rows
      .filter((row) => {
        const totalLimit = row.max_redemptions_total;
        const perCustomerLimit = row.max_redemptions_per_customer;
        const liveCounts =
          shopPromotionCache || !custKey ? redemptionByCoupon.get(String(row.id)) : null;
        const totalRedemptions =
          shopPromotionCache || !custKey
            ? (liveCounts?.total_redemptions ?? 0)
            : Number(row.total_redemptions) || 0;
        const customerRedemptions =
          shopPromotionCache || !custKey
            ? (liveCounts?.customer_redemptions ?? 0)
            : Number(row.customer_redemptions) || 0;
        if (typeof totalLimit === "number" && totalRedemptions >= totalLimit) return false;
        if (
          hasCustomerContext &&
          typeof perCustomerLimit === "number" &&
          customerRedemptions >= perCustomerLimit
        ) {
          return false;
        }

        const minSub = row.min_subtotal_minor != null ? Number(row.min_subtotal_minor) : null;
        const firstOrderOnly = row.first_order_only === true;
        const newCustomerOnly = row.new_customer_only === true;

        // Guest / no customerId: skip first-order / new-customer gates (same as priceStorefrontLines).
        if (hasCustomerContext && (firstOrderOnly || newCustomerOnly)) {
          const eligibility = buildCouponEligibility(
            { minSubtotalMinor: minSub, firstOrderOnly, newCustomerOnly },
            eligibilityCtx
          );
          if (!eligibility.applicable) return false;
        }
        return true;
      })
      .map((row) => {
        const minSub = row.min_subtotal_minor != null ? Number(row.min_subtotal_minor) : null;
        const firstOrderOnly = row.first_order_only === true;
        const newCustomerOnly = row.new_customer_only === true;

        const eligibility = hasCustomerContext
          ? buildCouponEligibility(
              { minSubtotalMinor: minSub, firstOrderOnly, newCustomerOnly },
              eligibilityCtx
            )
          : buildCouponEligibility(
              { minSubtotalMinor: minSub, firstOrderOnly: false, newCustomerOnly: false },
              eligibilityCtx
            );

        return {
          id: row.id,
          code: row.code_normalized,
          promotionId: row.promotion_id,
          promotionName: row.promotion_name,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          minSubtotalMinor: minSub,
          firstOrderOnly,
          newCustomerOnly,
          maxRedemptionsTotal: row.max_redemptions_total,
          maxRedemptionsPerCustomer: row.max_redemptions_per_customer,
          benefits: mapPublicPromotionBenefits(row.promotion_rules_public),
          eligibility
        };
      });

    if (onlyApplicable) {
      coupons = coupons.filter((c) => c.eligibility.applicable);
    }

    if (limit != null) {
      coupons = coupons.slice(0, Number(limit));
    }

    return {
      promotionsPaused: false,
      settings: publicSettings,
      coupons
    };
  };
}

function normalizeCouponCode(code) {
  if (typeof code !== "string") return null;
  const trimmed = code.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}
