/**
 * Raw bundle rule rows from `PromotionRepoPg` (before `mapActiveBundleRuleRow`).
 *
 * @param {object[]} rows
 * @param {string} shopProductId
 * @param {string | null | undefined} globalCategoryId
 */
export function filterBundleRuleRowsForProduct(rows, shopProductId, globalCategoryId) {
  const sid = String(shopProductId);
  const cid = globalCategoryId != null && globalCategoryId !== "" ? String(globalCategoryId) : null;
  return rows.filter((r) => {
    if (r.scope === "same_shop_product") return String(r.shop_product_id) === sid;
    if (r.scope === "global_category" && cid != null) return String(r.global_category_id) === cid;
    return false;
  });
}

/**
 * Purpose: Map promotion_bundle_rules rows to customer-safe JSON (no soft-delete audit fields).
 *
 * @param {object} r
 */
export function mapActiveBundleRuleRow(r) {
  const endsRaw = r.ends_at;
  const promotionEndsAt =
    endsRaw instanceof Date ? endsRaw.toISOString() : typeof endsRaw === "string" && endsRaw ? endsRaw : null;

  /** @type {Record<string, unknown>} */
  const out = {
    promotion_id: r.promotion_id,
    promotion_ends_at: promotionEndsAt,
    scope: r.scope,
    buy_qty: Number(r.buy_qty),
    get_qty: Number(r.get_qty),
    reward_type: r.reward_type
  };
  if (r.shop_product_id != null) out.shop_product_id = r.shop_product_id;
  if (r.global_category_id != null) out.global_category_id = r.global_category_id;
  if (r.reward_percent_bps != null) out.reward_percent_bps = Number(r.reward_percent_bps);
  return out;
}
