import { PromotionRepo } from "../../../application/ports/repositories/PromotionRepo.js";
import { setTenantContext } from "../../../infra/db/tenantContext.js";

/**
 * Purpose: PostgreSQL repository for customer promotion reads.
 */
export class PromotionRepoPg extends PromotionRepo {
  async getShopPromotionSettings(client, shopId) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT promotions_paused,
              default_overlap_mode,
              default_allow_coupon_after_auto,
              first_coupon_eligibility_days,
              max_coupons_per_order,
              allow_combine_auto_campaigns
         FROM shop_promotion_settings
        WHERE shop_id = $1::uuid
        LIMIT 1`,
      [shopId]
    );
    return rows[0] ?? null;
  }

  async listEligibleCouponsWithUsage(client, shopId, customerId, codeNormalized) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT
         c.id,
         c.shop_id,
         c.promotion_id,
         c.code_normalized,
         c.starts_at,
         c.ends_at,
         c.min_subtotal_minor,
         c.first_order_only,
         c.new_customer_only,
         c.max_redemptions_total,
         c.max_redemptions_per_customer,
         p.name AS promotion_name,
         COALESCE(ru.total_redemptions, 0) AS total_redemptions,
         COALESCE(ru.customer_redemptions, 0) AS customer_redemptions
       FROM promotion_coupons c
       JOIN promotions p
         ON p.id = c.promotion_id
        AND p.shop_id = c.shop_id
       LEFT JOIN (
         SELECT pr.coupon_id,
                count(*)::int AS total_redemptions,
                count(*) FILTER (WHERE pr.customer_id = $2)::int AS customer_redemptions
           FROM promotion_redemptions pr
          WHERE pr.shop_id = $1::uuid
          GROUP BY pr.coupon_id
       ) ru ON ru.coupon_id = c.id
       WHERE c.shop_id = $1::uuid
         AND c.is_deleted = false
         AND p.status = 'active'
         AND p.is_deleted = false
         AND c.starts_at <= now()
         AND c.ends_at >= now()
         AND p.starts_at <= now()
         AND p.ends_at >= now()
         AND ($3::text IS NULL OR c.code_normalized = $3)
       ORDER BY c.code_normalized ASC`,
      [shopId, String(customerId), codeNormalized]
    );
    return rows;
  }
}
