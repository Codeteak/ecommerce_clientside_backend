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

  async listEligibleCouponsWithUsage(client, shopId, customerId, codeNormalized, options = {}) {
    await setTenantContext(client, shopId);
    const limit =
      Number.isInteger(options?.limit) && options.limit > 0 ? Math.min(options.limit, 50) : null;
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
         COALESCE(ru.customer_redemptions, 0) AS customer_redemptions,
         pub_rules.promotion_rules_public
       FROM promotion_coupons c
       JOIN promotions p
         ON p.id = c.promotion_id
        AND p.shop_id = c.shop_id
       LEFT JOIN LATERAL (
         SELECT json_agg(
                  json_build_object(
                    'kind', pr.rule_kind,
                    'percentBps', pr.percent_bps,
                    'amountMinor', pr.amount_minor,
                    'minSubtotalMinor', pr.min_subtotal_minor
                  )
                  ORDER BY pr.created_at ASC
                ) AS promotion_rules_public
           FROM promotion_rules pr
          WHERE pr.shop_id = c.shop_id
            AND pr.promotion_id = c.promotion_id
            AND pr.is_deleted = false
       ) pub_rules ON true
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
       ORDER BY p.priority ASC, p.created_at DESC, c.code_normalized ASC
       ${limit != null ? "LIMIT $4" : ""}`,
      limit != null ? [shopId, String(customerId), codeNormalized, limit] : [shopId, String(customerId), codeNormalized]
    );
    return rows;
  }

  async listEligibleCouponDefinitions(client, shopId, codeNormalized, options = {}) {
    await setTenantContext(client, shopId);
    const limit =
      Number.isInteger(options?.limit) && options.limit > 0 ? Math.min(options.limit, 50) : null;
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
         pub_rules.promotion_rules_public
       FROM promotion_coupons c
       JOIN promotions p
         ON p.id = c.promotion_id
        AND p.shop_id = c.shop_id
       LEFT JOIN LATERAL (
         SELECT json_agg(
                  json_build_object(
                    'kind', pr.rule_kind,
                    'percentBps', pr.percent_bps,
                    'amountMinor', pr.amount_minor,
                    'minSubtotalMinor', pr.min_subtotal_minor
                  )
                  ORDER BY pr.created_at ASC
                ) AS promotion_rules_public
           FROM promotion_rules pr
          WHERE pr.shop_id = c.shop_id
            AND pr.promotion_id = c.promotion_id
            AND pr.is_deleted = false
       ) pub_rules ON true
       WHERE c.shop_id = $1::uuid
         AND c.is_deleted = false
         AND p.status = 'active'
         AND p.is_deleted = false
         AND c.starts_at <= now()
         AND c.ends_at >= now()
         AND p.starts_at <= now()
         AND p.ends_at >= now()
         AND ($2::text IS NULL OR c.code_normalized = $2)
       ORDER BY p.priority ASC, p.created_at DESC, c.code_normalized ASC
       ${limit != null ? "LIMIT $3" : ""}`,
      limit != null ? [shopId, codeNormalized, limit] : [shopId, codeNormalized]
    );
    return rows;
  }

  async getCouponRedemptionCounts(client, shopId, couponIds, customerId) {
    const ids = Array.isArray(couponIds) ? couponIds.map((x) => String(x)).filter(Boolean) : [];
    if (!ids.length) {
      return new Map();
    }
    await setTenantContext(client, shopId);
    const cust = customerId != null && String(customerId).trim() !== "" ? String(customerId) : null;
    const { rows } = await client.query(
      `SELECT coupon_id,
              count(*)::int AS total_redemptions,
              count(*) FILTER (WHERE customer_id = $3)::int AS customer_redemptions
         FROM promotion_redemptions
        WHERE shop_id = $1::uuid
          AND coupon_id = ANY($2::uuid[])
        GROUP BY coupon_id`,
      [shopId, ids, cust]
    );
    const map = new Map();
    for (const row of rows) {
      map.set(String(row.coupon_id), {
        total_redemptions: Number(row.total_redemptions) || 0,
        customer_redemptions: Number(row.customer_redemptions) || 0
      });
    }
    return map;
  }

  async findCouponByCodeForShop(client, shopId, codeNormalized, customerId = null) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT
         c.id,
         c.promotion_id,
         c.code_normalized,
         c.min_subtotal_minor,
         c.first_order_only,
         c.new_customer_only,
         c.max_redemptions_total,
         c.max_redemptions_per_customer,
         COALESCE(ru.total_redemptions, 0) AS total_redemptions,
         COALESCE(ru.customer_redemptions, 0) AS customer_redemptions,
         EXISTS (
           SELECT 1 FROM promotion_products pp
            WHERE pp.shop_id = c.shop_id
              AND pp.promotion_id = c.promotion_id
              AND pp.is_deleted = false
         ) AS has_sku_products,
         EXISTS (
           SELECT 1 FROM promotion_bundle_rules br
            WHERE br.shop_id = c.shop_id
              AND br.promotion_id = c.promotion_id
              AND br.is_deleted = false
         ) AS has_bundle_rules,
         EXISTS (
           SELECT 1 FROM promotion_rules pr
            WHERE pr.shop_id = c.shop_id
              AND pr.promotion_id = c.promotion_id
              AND pr.is_deleted = false
              AND pr.rule_kind IN (
                'cart_percent_off',
                'cart_fixed_off',
                'cart_fixed_off_if_subtotal_above',
                'cart_percent_off_if_subtotal_above',
                'category_percent_off'
              )
         ) AS has_coupon_rules,
         COALESCE(rules.promotion_rules, '[]'::json) AS promotion_rules
       FROM promotion_coupons c
       JOIN promotions p
         ON p.id = c.promotion_id
        AND p.shop_id = c.shop_id
       LEFT JOIN LATERAL (
         SELECT json_agg(
                  json_build_object(
                    'rule_kind', pr.rule_kind,
                    'percent_bps', pr.percent_bps,
                    'amount_minor', pr.amount_minor,
                    'min_subtotal_minor', pr.min_subtotal_minor,
                    'max_discount_minor', pr.max_discount_minor,
                    'global_category_id', pr.global_category_id,
                    'is_deleted', pr.is_deleted
                  )
                  ORDER BY pr.created_at ASC
                ) AS promotion_rules
           FROM promotion_rules pr
          WHERE pr.shop_id = c.shop_id
            AND pr.promotion_id = c.promotion_id
            AND pr.is_deleted = false
       ) rules ON true
       LEFT JOIN (
         SELECT pr.coupon_id,
                count(*)::int AS total_redemptions,
                count(*) FILTER (WHERE pr.customer_id = $3)::int AS customer_redemptions
           FROM promotion_redemptions pr
          WHERE pr.shop_id = $1::uuid
          GROUP BY pr.coupon_id
       ) ru ON ru.coupon_id = c.id
       WHERE c.shop_id = $1::uuid
         AND c.code_normalized = $2::text
         AND c.is_deleted = false
         AND p.status = 'active'
         AND p.is_deleted = false
         AND c.starts_at <= now()
         AND c.ends_at >= now()
         AND p.starts_at <= now()
         AND p.ends_at >= now()
       LIMIT 1`,
      [shopId, codeNormalized, customerId != null ? String(customerId) : null]
    );
    return rows[0] ?? null;
  }

  async insertPromotionRedemption(client, payload) {
    const { shopId, orderId, customerId, promotionId, couponId, discountMinor } = payload;
    await setTenantContext(client, shopId);
    await client.query(
      `INSERT INTO promotion_redemptions (
         shop_id, order_id, customer_id, promotion_id, coupon_id, discount_minor
       ) VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6)`,
      [shopId, orderId, String(customerId), promotionId ?? null, couponId ?? null, discountMinor]
    );
  }

  async getCouponRedemptionCountsForCustomer(client, shopId, customerId, couponIds) {
    const ids = Array.isArray(couponIds) ? couponIds.map((x) => String(x)).filter(Boolean) : [];
    if (!ids.length) {
      return new Map();
    }
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT coupon_id, count(*)::int AS customer_redemptions
         FROM promotion_redemptions
        WHERE shop_id = $1::uuid
          AND customer_id = $2
          AND coupon_id = ANY($3::uuid[])
        GROUP BY coupon_id`,
      [shopId, String(customerId), ids]
    );
    const map = new Map();
    for (const row of rows) {
      map.set(String(row.coupon_id), Number(row.customer_redemptions) || 0);
    }
    return map;
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
              p.ends_at,
              p.created_at
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

  async listActiveCategoryPromotionSignals(client, shopId) {
    await setTenantContext(client, shopId);
    const activePromo = `p.shop_id = $1::uuid
          AND p.is_deleted = false
          AND p.status = 'active'
          AND p.starts_at <= now()
          AND p.ends_at >= now()`;

    const { rows: skuRows } = await client.query(
      `SELECT DISTINCT gp.global_category_id::text AS id
         FROM promotion_products pp
         JOIN promotions p
           ON p.id = pp.promotion_id
          AND p.shop_id = pp.shop_id
         JOIN shop_products sp
           ON sp.id = pp.shop_product_id
          AND sp.shop_id = pp.shop_id
         JOIN global_products gp ON gp.id = sp.global_product_id
        WHERE pp.shop_id = $1::uuid
          AND pp.is_deleted = false
          AND sp.status = 'active'
          AND gp.global_category_id IS NOT NULL
          AND ${activePromo}`,
      [shopId]
    );

    const { rows: ruleRows } = await client.query(
      `SELECT pr.promotion_id,
              pr.global_category_id::text AS global_category_id,
              pr.percent_bps,
              pr.max_discount_minor::text AS max_discount_minor,
              p.ends_at
         FROM promotion_rules pr
         JOIN promotions p
           ON p.id = pr.promotion_id
          AND p.shop_id = pr.shop_id
        WHERE pr.shop_id = $1::uuid
          AND pr.is_deleted = false
          AND pr.rule_kind = 'category_percent_off'
          AND pr.global_category_id IS NOT NULL
          AND ${activePromo}
        ORDER BY p.priority ASC, pr.updated_at DESC
        LIMIT 500`,
      [shopId]
    );

    return {
      skuPromoCategoryIds: skuRows.map((r) => String(r.id)).filter(Boolean),
      categoryDiscountRules: ruleRows
    };
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
              p.priority,
              p.created_at,
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
        ORDER BY p.priority ASC, p.created_at DESC, br.updated_at DESC
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
