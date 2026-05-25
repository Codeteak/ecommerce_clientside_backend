import { mapActiveBundleRuleRow } from "./mapActiveBundleRulesPublic.js";

/**
 * @param {object[]} rows
 * @param {string} globalCategoryId
 */
export function filterBundleRuleRowsForCategory(rows, globalCategoryId) {
  const cid = String(globalCategoryId);
  return rows.filter(
    (r) => r.scope === "global_category" && r.global_category_id != null && String(r.global_category_id) === cid
  );
}

/**
 * @param {object} r
 */
export function mapCategoryDiscountRuleRow(r) {
  const endsRaw = r.ends_at;
  const promotionEndsAt =
    endsRaw instanceof Date ? endsRaw.toISOString() : typeof endsRaw === "string" && endsRaw ? endsRaw : null;
  /** @type {Record<string, unknown>} */
  const out = {
    promotion_id: r.promotion_id,
    kind: "category_percent_off",
    percent_bps: Number(r.percent_bps)
  };
  const maxDiscount = r.max_discount_minor;
  if (maxDiscount != null && maxDiscount !== "") {
    out.max_discount_minor = Number(maxDiscount);
  }
  if (promotionEndsAt) {
    out.promotion_ends_at = promotionEndsAt;
  }
  return out;
}

/**
 * @param {{
 *   category: object,
 *   promotionsPaused: boolean,
 *   skuPromoCategoryIds: Set<string>,
 *   categoryDiscountRulesByCategory: Map<string, object[]>,
 *   bundleRowsRaw: object[]
 * }} input
 */
export function withCategoryListingOffers(input) {
  const {
    category,
    promotionsPaused,
    skuPromoCategoryIds,
    categoryDiscountRulesByCategory,
    bundleRowsRaw
  } = input;
  const id = String(category.id);
  if (promotionsPaused) {
    return {
      ...category,
      offers: {
        has_sku_promo: false,
        has_bundle: false,
        has_category_discount: false
      },
      bundle_rules: [],
      category_discount_rules: []
    };
  }
  const bundleSubset = filterBundleRuleRowsForCategory(bundleRowsRaw, id);
  const discountRows = categoryDiscountRulesByCategory.get(id) ?? [];
  const categoryDiscountRules = discountRows.map(mapCategoryDiscountRuleRow);
  const hasCategoryDiscount = categoryDiscountRules.length > 0;
  const hasBundle = bundleSubset.length > 0;
  const hasSkuPromo = skuPromoCategoryIds.has(id);
  return {
    ...category,
    offers: {
      has_sku_promo: hasSkuPromo,
      has_bundle: hasBundle,
      has_category_discount: hasCategoryDiscount
    },
    bundle_rules: bundleSubset.map(mapActiveBundleRuleRow),
    category_discount_rules: categoryDiscountRules
  };
}
