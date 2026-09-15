import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";

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
    if (r.scope === "cross_shop_products") {
      return (
        String(r.buy_shop_product_id ?? "") === sid ||
        String(r.reward_shop_product_id ?? "") === sid
      );
    }
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
  if (r.buy_shop_product_id != null) out.buy_shop_product_id = r.buy_shop_product_id;
  if (r.reward_shop_product_id != null) out.reward_shop_product_id = r.reward_shop_product_id;
  if (r.reward_percent_bps != null) out.reward_percent_bps = Number(r.reward_percent_bps);
  const buyName = r.buy_product_name || r.same_product_name;
  const rewardName = r.reward_product_name;
  if (buyName) out.buy_product_name = String(buyName);
  if (rewardName) out.reward_product_name = String(rewardName);
  const rewardThumb = toPublicMediaUrl(r.reward_thumb_storage_key);
  const rewardImage = r.reward_product_image || rewardThumb || r.same_product_image;
  const buyImage = r.buy_product_image || r.same_product_image;
  if (rewardImage) out.reward_product_image = String(rewardImage).trim();
  if (buyImage) out.buy_product_image = String(buyImage).trim();
  return out;
}
