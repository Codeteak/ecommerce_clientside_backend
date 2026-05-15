import { buildCouponEligibility } from "./couponEligibility.js";
import { mapPublicPromotionBenefits } from "./publicPromotionBenefits.js";

/**
 * Purpose: List customer-visible coupons for the current shop context with
 * eligibility hints aligned to shop_promotion_settings and promotion_coupons.
 *
 * @param {{
 *   promotionRepo: import("../../ports/repositories/PromotionRepo.js").PromotionRepo,
 *   authRepo: import("../../ports/repositories/CustomerAuthRepo.js").CustomerAuthRepo,
 *   orderRepo: import("../../ports/repositories/OrderRepo.js").OrderRepo
 * }} deps
 */
export function createListApplicableCoupons({ promotionRepo, authRepo, orderRepo }) {
  const defaultSettings = {
    promotions_paused: false,
    first_coupon_eligibility_days: 30,
    max_coupons_per_order: 1,
    allow_combine_auto_campaigns: true
  };

  /**
   * @param {import("pg").PoolClient} client
   * @param {{ shopId: string, customerId: string, code?: string | null, cartSubtotalMinor?: number | null, onlyApplicable?: boolean }} input
   */
  return async function listApplicableCoupons(client, {
    shopId,
    customerId,
    code = null,
    cartSubtotalMinor = null,
    onlyApplicable = false
  }) {
    const normalizedCode = normalizeCouponCode(code);
    const rawSettings = await promotionRepo.getShopPromotionSettings(client, shopId);
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

    const [customerRow, deliveredCount] = await Promise.all([
      authRepo.getCustomerCreatedAtById(client, customerId),
      orderRepo.countDeliveredOrdersForCustomer(client, shopId, String(customerId))
    ]);

    if (!customerRow?.created_at) {
      return {
        promotionsPaused: false,
        settings: publicSettings,
        coupons: []
      };
    }

    const customerCreatedAt = new Date(customerRow.created_at);
    const eligibilityDays = publicSettings.firstCouponEligibilityDays;
    const ms = Math.max(0, eligibilityDays) * 24 * 60 * 60 * 1000;
    const newCustomerCutoff = new Date(Date.now() - ms);

    const rows = await promotionRepo.listEligibleCouponsWithUsage(
      client,
      shopId,
      customerId,
      normalizedCode
    );

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
        if (typeof totalLimit === "number" && row.total_redemptions >= totalLimit) return false;
        if (typeof perCustomerLimit === "number" && row.customer_redemptions >= perCustomerLimit) return false;

        const minSub = row.min_subtotal_minor != null ? Number(row.min_subtotal_minor) : null;
        const firstOrderOnly = row.first_order_only === true;
        const newCustomerOnly = row.new_customer_only === true;
        const eligibility = buildCouponEligibility(
          { minSubtotalMinor: minSub, firstOrderOnly, newCustomerOnly },
          eligibilityCtx
        );
        if (firstOrderOnly || newCustomerOnly) {
          if (!eligibility.applicable) return false;
        }
        return true;
      })
      .map((row) => {
        const minSub = row.min_subtotal_minor != null ? Number(row.min_subtotal_minor) : null;
        const firstOrderOnly = row.first_order_only === true;
        const newCustomerOnly = row.new_customer_only === true;

        const eligibility = buildCouponEligibility(
          { minSubtotalMinor: minSub, firstOrderOnly, newCustomerOnly },
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
