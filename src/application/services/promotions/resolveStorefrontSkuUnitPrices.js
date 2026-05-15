/**
 * Purpose: Resolve per-SKU promo overlay price from promotion_products + overlap policy.
 * Exposes list/offer/promo plus computed unit fields: total_price_minor (compare-at anchor),
 * final_price_minor (payable unit), offer_discount_minor, promo_discount_minor, total_discount_minor.
 */

/** @param {unknown} v */
export function parseMinor(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Baseline selling unit from catalog: use offer when strictly below list (MRP).
 * Must match `SHOP_PRODUCT_BASELINE_UNIT_MINOR_SQL` in `catalogBaselineUnitSql.js`.
 * @param {unknown} priceMinorStr
 * @param {unknown} offerMinorStr
 */
export function baselineUnitMinorFromCatalog(priceMinorStr, offerMinorStr) {
  const price = parseMinor(priceMinorStr);
  if (price == null) return 0;
  const offer = parseMinor(offerMinorStr);
  if (offer != null && offer < price) return offer;
  return price;
}

/**
 * Strike-through / "was" reference: at least list (MRP) and baseline.
 * @param {unknown} listMinorStr
 * @param {number} baselineMinor
 */
export function compareAtUnitMinor(listMinorStr, baselineMinor) {
  const list = parseMinor(listMinorStr);
  if (list == null) return baselineMinor;
  return Math.max(list, baselineMinor);
}

/**
 * Per-unit storefront pricing: list (MRP), catalog baseline, optional campaign replacement,
 * compare-at anchor, and non-negative discount legs (minor currency integers).
 *
 * @param {unknown} listMinorStr shop_products.price_minor_per_unit
 * @param {unknown} offerMinorStr shop_products.offer_price_minor_per_unit
 * @param {number | null} promoPriceMinor winning campaign unit price or null
 */
export function computeStorefrontUnitPricing(listMinorStr, offerMinorStr, promoPriceMinor) {
  const list = parseMinor(listMinorStr) ?? 0;
  const baselineMinor = baselineUnitMinorFromCatalog(listMinorStr, offerMinorStr);
  const finalMinor = promoPriceMinor != null ? promoPriceMinor : baselineMinor;
  const compareAt = compareAtUnitMinor(listMinorStr, baselineMinor);
  const offerDiscountMinor = Math.max(0, list - baselineMinor);
  const promoDiscountMinor = Math.max(0, baselineMinor - finalMinor);
  const totalDiscountMinor = Math.max(0, compareAt - finalMinor);
  return {
    listMinor: list,
    baselineMinor,
    finalMinor,
    compareAtMinor: compareAt,
    offerDiscountMinor,
    promoDiscountMinor,
    totalDiscountMinor
  };
}

/**
 * @typedef {{ shop_product_id: string, promotion_id: string, promo_price_minor_per_unit: string | number, priority: number, overlap_mode: string | null, ends_at?: Date | string | null, created_at?: Date | string | null }} PromoOverlayRow
 */

/**
 * When multiple campaigns price the same SKU, pick one overlay row.
 * Convention: priority ASC = higher campaign priority (lower SMALLINT wins).
 * Tie-break: newest campaign (created_at DESC), then promotion_id lexical.
 *
 * @param {PromoOverlayRow[]} candidates
 * @param {'priority' | 'best_for_customer'} mode
 */
export function pickWinningPromoOverlay(candidates, mode) {
  if (!candidates.length) return null;
  if (mode === "best_for_customer") {
    let best = candidates[0];
    let bestPrice = parseMinor(best.promo_price_minor_per_unit);
    for (let i = 1; i < candidates.length; i += 1) {
      const c = candidates[i];
      const p = parseMinor(c.promo_price_minor_per_unit);
      if (p == null) continue;
      if (bestPrice == null || p < bestPrice) {
        best = c;
        bestPrice = p;
      } else if (bestPrice != null && p === bestPrice && String(c.promotion_id) < String(best.promotion_id)) {
        best = c;
      }
    }
    return best;
  }
  return [...candidates].sort((a, b) => {
    const pa = Number(a.priority);
    const pb = Number(b.priority);
    const na = Number.isFinite(pa) ? pa : 0;
    const nb = Number.isFinite(pb) ? pb : 0;
    if (na !== nb) return na - nb;
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (ta !== tb) return tb - ta;
    return String(a.promotion_id).localeCompare(String(b.promotion_id));
  })[0];
}

/**
 * Effective overlap for competing campaigns on one SKU uses shop default when
 * any candidate omits overlap_mode; if candidates disagree, shop default wins.
 *
 * @param {PromoOverlayRow[]} candidates
 * @param {'priority' | 'best_for_customer'} shopDefault
 */
export function resolveListingOverlapMode(candidates, shopDefault) {
  const modes = new Set(
    candidates
      .map((c) => (c.overlap_mode === "best_for_customer" || c.overlap_mode === "priority" ? c.overlap_mode : null))
      .filter(Boolean)
  );
  if (modes.size === 1) {
    return /** @type {'priority' | 'best_for_customer'} */ ([...modes][0]);
  }
  return shopDefault === "best_for_customer" ? "best_for_customer" : "priority";
}

/**
 * @param {{ promotionsPaused: boolean, defaultOverlapMode: string, products: Array<{ id: string, price_minor_per_unit?: unknown, offer_price_minor_per_unit?: unknown }>, overlays: PromoOverlayRow[] }} input
 * @returns {Map<string, { promoPriceMinor: number | null }>}
 */
export function buildStorefrontListingUnitPriceMap(input) {
  const { promotionsPaused, defaultOverlapMode, products, overlays } = input;
  const shopDefault = defaultOverlapMode === "best_for_customer" ? "best_for_customer" : "priority";

  /** @type {Map<string, PromoOverlayRow[]>} */
  const bySku = new Map();
  for (const o of overlays) {
    const id = String(o.shop_product_id);
    if (!bySku.has(id)) bySku.set(id, []);
    bySku.get(id).push(o);
  }

  /** @type {Map<string, { promoPriceMinor: number | null }>} */
  const out = new Map();

  for (const row of products) {
    const id = String(row.id);

    if (promotionsPaused) {
      out.set(id, { promoPriceMinor: null });
      continue;
    }

    const cands = bySku.get(id) ?? [];
    if (!cands.length) {
      out.set(id, { promoPriceMinor: null });
      continue;
    }

    const mode = resolveListingOverlapMode(cands, shopDefault);
    const winner = pickWinningPromoOverlay(cands, mode);
    const promoP = winner ? parseMinor(winner.promo_price_minor_per_unit) : null;
    out.set(id, { promoPriceMinor: promoP != null ? promoP : null });
  }

  return out;
}

/** @param {number} n */
export function minorToApiString(n) {
  return String(Math.trunc(n));
}

/**
 * Storefront pricing: list (actual), optional catalog offer, optional campaign SKU promo only.
 * Removes legacy `price_minor_per_unit` / `offer_price_minor_per_unit` from the mapped product.
 *
 * @param {Record<string, unknown>} productApi from mapStorefrontProductRow (may include old price keys)
 * @param {{ id: unknown, price_minor_per_unit?: unknown, offer_price_minor_per_unit?: unknown }} row DB row
 * @param {number | null} promoPriceMinor winning overlay unit price or null
 */
export function withStorefrontProductPricing(productApi, row, promoPriceMinor) {
  const { price_minor_per_unit: _p, offer_price_minor_per_unit: _o, ...rest } = productApi;
  const offerRaw = row.offer_price_minor_per_unit;
  const hasOffer = offerRaw != null && offerRaw !== "";
  const offerParsed = hasOffer ? parseMinor(offerRaw) : null;
  const p = computeStorefrontUnitPricing(row.price_minor_per_unit, row.offer_price_minor_per_unit, promoPriceMinor);

  return {
    ...rest,
    actual_price_minor: minorToApiString(p.listMinor),
    offer_price_minor: offerParsed != null ? minorToApiString(offerParsed) : null,
    promo_price_minor: promoPriceMinor != null ? minorToApiString(promoPriceMinor) : null,
    total_price_minor: minorToApiString(p.compareAtMinor),
    final_price_minor: minorToApiString(p.finalMinor),
    offer_discount_minor: minorToApiString(p.offerDiscountMinor),
    promo_discount_minor: minorToApiString(p.promoDiscountMinor),
    total_discount_minor: minorToApiString(p.totalDiscountMinor)
  };
}

/**
 * Product detail (mapProductDetail output has no catalog price keys — pass row only).
 * Same pricing fields as list rows.
 *
 * @param {Record<string, unknown>} detailBase
 * @param {{ price_minor_per_unit?: unknown, offer_price_minor_per_unit?: unknown }} productRow
 * @param {number | null} promoPriceMinor
 */
export function withStorefrontDetailPricing(detailBase, productRow, promoPriceMinor) {
  const offerRaw = productRow.offer_price_minor_per_unit;
  const hasOffer = offerRaw != null && offerRaw !== "";
  const offerParsed = hasOffer ? parseMinor(offerRaw) : null;
  const p = computeStorefrontUnitPricing(
    productRow.price_minor_per_unit,
    productRow.offer_price_minor_per_unit,
    promoPriceMinor
  );

  return {
    ...detailBase,
    actual_price_minor: minorToApiString(p.listMinor),
    offer_price_minor: offerParsed != null ? minorToApiString(offerParsed) : null,
    promo_price_minor: promoPriceMinor != null ? minorToApiString(promoPriceMinor) : null,
    total_price_minor: minorToApiString(p.compareAtMinor),
    final_price_minor: minorToApiString(p.finalMinor),
    offer_discount_minor: minorToApiString(p.offerDiscountMinor),
    promo_discount_minor: minorToApiString(p.promoDiscountMinor),
    total_discount_minor: minorToApiString(p.totalDiscountMinor)
  };
}
