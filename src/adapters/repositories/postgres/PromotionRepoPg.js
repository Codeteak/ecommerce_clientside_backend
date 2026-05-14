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

  async listActivePromotionProductOverlaysForShopProducts(client, shopId, shopProductIds) {
    const ids = Array.isArray(shopProductIds) ? shopProductIds.map((x) => String(x)).filter(Boolean) : [];
    if (ids.length === 0) {
      return [];
    }
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT pp.shop_product_id,
              pp.promotion_id,
              pp.promo_price_minor_per_unit::text AS promo_price_minor_per_unit,
              p.priority,
              p.overlap_mode,
              p.ends_at
         FROM promotion_products pp
         JOIN promotions p
           ON p.id = pp.promotion_id
          AND p.shop_id = pp.shop_id
        WHERE pp.shop_id = $1::uuid
          AND pp.is_deleted = false
          AND p.is_deleted = false
          AND p.status = 'active'
          AND p.starts_at <= now()
          AND p.ends_at >= now()
          AND pp.shop_product_id = ANY($2::uuid[])`,
      [shopId, ids]
    );
    return rows;
  }

  async listActiveBundleRulesForShop(client, shopId) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT br.promotion_id,
              br.scope,
              br.shop_product_id,
              br.global_category_id,
              br.buy_qty,
              br.get_qty,
              br.reward_type,
              br.reward_percent_bps,
              p.ends_at
         FROM promotion_bundle_rules br
         JOIN promotions p
           ON p.id = br.promotion_id
          AND p.shop_id = br.shop_id
        WHERE br.shop_id = $1::uuid
          AND br.is_deleted = false
          AND p.is_deleted = false
          AND p.status = 'active'
          AND p.starts_at <= now()
          AND p.ends_at >= now()
        ORDER BY br.updated_at DESC
        LIMIT 200`,
      [shopId]
    );
    return rows;
  }

  async listActiveBundleRulesForProduct(client, shopId, shopProductId, globalCategoryId) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT br.promotion_id,
              br.scope,
              br.shop_product_id,
              br.global_category_id,
              br.buy_qty,
              br.get_qty,
              br.reward_type,
              br.reward_percent_bps,
              p.ends_at
         FROM promotion_bundle_rules br
         JOIN promotions p
           ON p.id = br.promotion_id
          AND p.shop_id = br.shop_id
        WHERE br.shop_id = $1::uuid
          AND br.is_deleted = false
          AND p.is_deleted = false
          AND p.status = 'active'
          AND p.starts_at <= now()
          AND p.ends_at >= now()
          AND (
            (br.scope = 'same_shop_product' AND br.shop_product_id = $2::uuid)
            OR (
              br.scope = 'global_category'
              AND $3::uuid IS NOT NULL
              AND br.global_category_id = $3::uuid
            )
          )
        ORDER BY br.updated_at DESC
        LIMIT 50`,
      [shopId, shopProductId, globalCategoryId]
    );
    return rows;
  }
}
