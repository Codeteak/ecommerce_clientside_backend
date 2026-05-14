import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { buildCouponEligibility } from "./couponEligibility.js";
import { mapPublicPromotionBenefits } from "./publicPromotionBenefits.js";

/**
 * Purpose: Single-coupon storefront read with public fields, benefits, and eligibility.
 *
 * @param {{
 *   promotionRepo: import("../../ports/repositories/PromotionRepo.js").PromotionRepo,
 *   authRepo: import("../../ports/repositories/CustomerAuthRepo.js").CustomerAuthRepo,
 *   orderRepo: import("../../ports/repositories/OrderRepo.js").OrderRepo
 * }} deps
 */
export function createGetCustomerCouponDetail({ promotionRepo, authRepo, orderRepo }) {
  const defaultSettings = {
    promotions_paused: false,
    first_coupon_eligibility_days: 30,
    max_coupons_per_order: 1,
    allow_combine_auto_campaigns: true
  };

  /**
   * @param {import("pg").PoolClient} client
   * @param {{ shopId: string, customerId: string, couponId: string, cartSubtotalMinor?: number | null }} input
   */
  return async function getCustomerCouponDetail(client, { shopId, customerId, couponId, cartSubtotalMinor = null }) {
    const [row, customerRow, deliveredCount] = await Promise.all([
      promotionRepo.getCustomerCouponDetailWithUsage(client, shopId, customerId, couponId),
      authRepo.getCustomerCreatedAtById(client, customerId),
      orderRepo.countDeliveredOrdersForCustomer(client, shopId, String(customerId))
    ]);

    if (!row) {
      throw new NotFoundError("Coupon not found");
    }

    if (!customerRow?.created_at) {
      throw new NotFoundError("Coupon not found");
    }

    const rawSettings = Object.fromEntries(
      Object.entries({
        promotions_paused: row.sps_promotions_paused,
        first_coupon_eligibility_days: row.sps_first_coupon_eligibility_days,
        max_coupons_per_order: row.sps_max_coupons_per_order,
        allow_combine_auto_campaigns: row.sps_allow_combine_auto_campaigns
      }).filter(([, v]) => v != null)
    );
    const settings = { ...defaultSettings, ...rawSettings };
    const publicSettings = {
      maxCouponsPerOrder: Number(settings.max_coupons_per_order ?? defaultSettings.max_coupons_per_order),
      allowCombineAutoCampaigns: Boolean(settings.allow_combine_auto_campaigns ?? defaultSettings.allow_combine_auto_campaigns),
      firstCouponEligibilityDays: Number(settings.first_coupon_eligibility_days ?? defaultSettings.first_coupon_eligibility_days)
    };

    const customerCreatedAt = new Date(customerRow.created_at);
    const eligibilityDays = publicSettings.firstCouponEligibilityDays;
    const ms = Math.max(0, eligibilityDays) * 24 * 60 * 60 * 1000;
    const newCustomerCutoff = new Date(Date.now() - ms);

    const totalLimit = row.max_redemptions_total;
    const perCustomerLimit = row.max_redemptions_per_customer;
    if (typeof totalLimit === "number" && row.total_redemptions >= totalLimit) {
      throw new NotFoundError("Coupon not found");
    }
    if (typeof perCustomerLimit === "number" && row.customer_redemptions >= perCustomerLimit) {
      throw new NotFoundError("Coupon not found");
    }

    const minSub = row.min_subtotal_minor != null ? Number(row.min_subtotal_minor) : null;
    const firstOrderOnly = row.first_order_only === true;
    const newCustomerOnly = row.new_customer_only === true;

    const eligibility = buildCouponEligibility(
      { minSubtotalMinor: minSub, firstOrderOnly, newCustomerOnly },
      {
        deliveredCount,
        customerCreatedAt,
        newCustomerCutoff,
        cartSubtotalMinor
      }
    );

    const benefits = mapPublicPromotionBenefits(row.promotion_rules_public);

    return {
      settings: publicSettings,
      coupon: {
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
        benefits,
        eligibility
      }
    };
  };
}
