/**
 * Purpose: Shapes storefront cart API responses for clients (minimal fields, promo-aware).
 */

function pickImageUrl(row) {
  const fromImage = row?.image?.url ?? row?.image_url ?? row?.thumbnail_url ?? null;
  if (typeof fromImage === "string" && fromImage.trim()) {
    const u = fromImage.trim();
    if (u.startsWith("data:")) return null;
    if (u.includes(",")) {
      const first = u.split(",")[0].trim();
      return first.startsWith("http") ? first : null;
    }
    return u.startsWith("http") ? u : null;
  }
  const raw = typeof row?.global_image_url === "string" ? row.global_image_url.trim() : "";
  if (!raw || raw.startsWith("data:")) return null;
  if (raw.includes(",")) {
    const first = raw.split(",")[0].trim();
    return first.startsWith("http") ? first : null;
  }
  if (raw.startsWith("http")) return raw;
  return null;
}

/**
 * @param {Record<string, unknown> | undefined} pricedLine
 * @param {Record<string, unknown>} rawRow
 * @param {{ offerQty?: number }} ctx
 */
function inferPromoTypes(pricedLine, rawRow, ctx = {}) {
  const types = [];
  const list = Number(pricedLine?.list_price_minor ?? rawRow?.unit_price_minor ?? 0);
  const offerRaw = rawRow?.offer_price_minor_per_unit ?? rawRow?.list_price_minor_per_unit;
  const offer = offerRaw != null ? Number(offerRaw) : list;
  const final = Number(pricedLine?.final_price_minor ?? list);
  const promoDisc = Number(pricedLine?.promo_discount_minor ?? 0);
  const offerDisc = Number(pricedLine?.offer_discount_minor ?? 0);
  const offerQty = Number(ctx.offerQty ?? 0);

  if (offerDisc > 0 && offer < list) types.push("offer");
  if (promoDisc > 0 && final < Math.min(offer, list)) types.push("sku");
  if (offerQty > 0) types.push("bundle");

  return types;
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown> | undefined} pricedLine
 */
export function formatStorefrontCartItem(row, pricedLine) {
  const inCartQty = Number(
    row.billable_quantity ?? row.quantity ?? pricedLine?.paid_quantity ?? pricedLine?.quantity ?? 0
  );
  const offerQty = Number(pricedLine?.free_quantity ?? row.free_quantity ?? 0);

  const promotionIds = Array.isArray(pricedLine?.applied_promotion_ids)
    ? pricedLine.applied_promotion_ids
    : Array.isArray(row.applied_promotion_ids)
      ? row.applied_promotion_ids
      : [];

  const listMinor = pricedLine?.list_price_minor ?? row.list_price_minor_per_unit ?? row.unit_price_minor;
  const offerMinor =
    row.offer_price_minor_per_unit != null
      ? row.offer_price_minor_per_unit
      : listMinor;
  const finalMinor = pricedLine?.final_price_minor ?? offerMinor ?? listMinor;
  const lineTotalMinor = pricedLine?.line_total_minor ?? null;

  const item = {
    id: String(row.id),
    product_id: row.product_id ?? null,
    slug: row.product_slug ?? null,
    title: row.title_snapshot ?? null,
    unit: row.unit_label ?? null,
    image_url: pickImageUrl(row),
    quantity: inCartQty,
    offer_quantity: offerQty,
    pricing: {
      list_minor: listMinor != null ? String(listMinor) : null,
      offer_minor: offerMinor != null ? String(offerMinor) : null,
      final_minor: finalMinor != null ? String(finalMinor) : null,
      line_total_minor: lineTotalMinor != null ? String(lineTotalMinor) : null
    },
    promo: {
      types: inferPromoTypes(pricedLine, row, { offerQty }),
      promotion_ids: promotionIds.map(String)
    }
  };

  if (row.price_updated === true) {
    item.price_updated = true;
    item.previous_list_minor =
      row.previous_unit_price_minor != null ? String(row.previous_unit_price_minor) : null;
  }

  return item;
}

/**
 * @param {Array<Record<string, unknown>>} items
 */
export function collectPromoTypesFromItems(items) {
  const set = new Set();
  for (const it of items) {
    for (const t of it.promo?.types ?? []) set.add(t);
  }
  return [...set];
}

/**
 * @param {object} promotionsBase
 * @param {Array<{ code: string, applicable?: boolean }>} suggestedCoupons
 * @param {Array<Record<string, unknown>>} items
 */
export function formatStorefrontPromotions(promotionsBase, suggestedCoupons, items) {
  const coupon = promotionsBase?.coupon ?? {};
  const types = collectPromoTypesFromItems(items);
  if (coupon.status === "applied") types.push("coupon");
  return {
    paused: promotionsBase?.paused === true,
    types: [...new Set(types)],
    promotion_ids: Array.isArray(promotionsBase?.auto?.applied_promotion_ids)
      ? promotionsBase.auto.applied_promotion_ids
      : [],
    coupon: {
      code: coupon.code ?? null,
      status: coupon.status ?? "none",
      discount_minor: Number(coupon.discount_minor ?? 0),
      reason_code: coupon.reason_code ?? null,
      reason_message: coupon.reason_message ?? null
    },
    suggested_coupons: (suggestedCoupons ?? []).map((c) => ({
      code: c.code,
      applicable: c.applicable === true,
      reason_codes: c.reason_codes ?? []
    }))
  };
}

/**
 * @param {object} priced
 * @param {number} unitsTotal
 */
export function formatStorefrontSummary(priced, unitsTotal) {
  if (!priced) {
    return {
      subtotal_minor: 0,
      subtotal_before_coupon_minor: 0,
      promotion_discount_minor: 0,
      coupon_discount_minor: 0,
      currency: "INR",
      units_display_total: 0
    };
  }
  return {
    subtotal_minor: priced.subtotalMinor,
    subtotal_before_coupon_minor: priced.subtotalBeforeCouponMinor ?? priced.subtotalMinor,
    promotion_discount_minor: priced.promotionDiscountTotalMinor,
    coupon_discount_minor: priced.couponDiscountMinor ?? 0,
    currency: "INR",
    units_display_total: unitsTotal
  };
}
