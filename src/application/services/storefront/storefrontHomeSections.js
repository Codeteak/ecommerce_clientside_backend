import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";
import { buildStorefrontListingUnitPriceMap } from "../promotions/resolveStorefrontSkuUnitPrices.js";
import {
  filterBundleRuleRowsForProduct,
  mapActiveBundleRuleRow
} from "../promotions/mapActiveBundleRulesPublic.js";

function asIdList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((id) => String(id)).filter(Boolean);
}

function orderByIds(rows, ids, key = "id") {
  const map = new Map(rows.map((row) => [String(row[key]), row]));
  return ids.map((id) => map.get(String(id))).filter(Boolean);
}

function priceMinor(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Record<string, unknown>} row
 * @param {Map<string, { promoPriceMinor: number | null }>} priceMap
 * @param {unknown[]} bundleRowsRaw
 */
export function mapHomeSectionProduct(row, priceMap = null, bundleRowsRaw = []) {
  const globalImageUrl =
    typeof row.global_image_url === "string" && row.global_image_url !== "" ? row.global_image_url : null;
  const imageUrl = globalImageUrl ?? toPublicMediaUrl(row.thumb_storage_key);
  const id = String(row.id);
  const listMinor = priceMinor(row.price_minor_per_unit);
  const offerMinor = priceMinor(row.offer_price_minor_per_unit);
  const promoEntry = priceMap?.get(id);
  const promoPriceMinor = promoEntry?.promoPriceMinor ?? null;
  const baseline =
    offerMinor != null && listMinor != null && offerMinor < listMinor ? offerMinor : listMinor;
  const finalMinor =
    promoPriceMinor != null && baseline != null
      ? Math.min(baseline, promoPriceMinor)
      : promoPriceMinor != null
        ? promoPriceMinor
        : baseline;

  const categoryId = row.category_id != null ? String(row.category_id) : null;
  const bundleRules = filterBundleRuleRowsForProduct(bundleRowsRaw, id, categoryId).map(
    mapActiveBundleRuleRow
  );

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    imageUrl: imageUrl ?? null,
    priceMinorPerUnit: listMinor,
    offerPriceMinorPerUnit: offerMinor,
    promoPriceMinorPerUnit: promoPriceMinor,
    finalPriceMinorPerUnit: finalMinor,
    actualPriceMinor: listMinor != null ? String(Math.trunc(listMinor)) : null,
    offerPriceMinor: offerMinor != null ? String(Math.trunc(offerMinor)) : null,
    promoPriceMinor: promoPriceMinor != null ? String(Math.trunc(promoPriceMinor)) : null,
    finalPriceMinor: finalMinor != null ? String(Math.trunc(finalMinor)) : null,
    bundleRules
  };
}

export function mapHomeSectionCategory(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug ?? null,
    imageUrl: toPublicMediaUrl(row.image_storage_key)
  };
}

export function bxgyLabel(buyQty, getQty) {
  const buy = Number.isInteger(buyQty) ? buyQty : 1;
  const get = Number.isInteger(getQty) ? getQty : 1;
  if (buy === 1 && get === 1) return "Buy 1 Get 1 Free";
  return `Buy ${buy} Get ${get}`;
}

export function isoOrNull(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/**
 * Resolve staff-configured home shelves for storefront (enabled + in-date, products hydrated).
 * @param {import("../../ports/repositories/CatalogRepo.js").CatalogRepo} catalogRepo
 * @param {string} shopId
 * @param {{
 *   loadListingPromotionsContext?: (shopId: string, pageRows: unknown[]) => Promise<{
 *     promotionsPaused: boolean,
 *     priceMap: Map<string, { promoPriceMinor: number | null }>,
 *     bundleRowsRaw: unknown[]
 *   }>
 * }} [opts]
 */
export async function resolveStorefrontHomeSections(catalogRepo, shopId, opts = {}) {
  const rows = await catalogRepo.listEnabledHomeSectionsStorefront(shopId);
  if (!rows.length) return [];

  const productIds = [];
  const categoryIds = [];
  for (const row of rows) {
    productIds.push(
      ...asIdList(row.product_ids),
      ...asIdList(row.buy_product_ids),
      ...asIdList(row.get_product_ids)
    );
    categoryIds.push(...asIdList(row.category_ids));
  }

  const [productRows, categoryRows] = await Promise.all([
    catalogRepo.listSellableProductsByIdsStorefront(shopId, [...new Set(productIds)]),
    catalogRepo.listActiveCategoriesByIdsStorefront(shopId, [...new Set(categoryIds)])
  ]);

  let priceMap = new Map();
  let bundleRowsRaw = [];
  if (typeof opts.loadListingPromotionsContext === "function" && productRows.length > 0) {
    const ctx = await opts.loadListingPromotionsContext(shopId, productRows);
    priceMap = ctx.priceMap ?? new Map();
    bundleRowsRaw = Array.isArray(ctx.bundleRowsRaw) ? ctx.bundleRowsRaw : [];
    if (ctx.promotionsPaused) {
      priceMap = buildStorefrontListingUnitPriceMap({
        promotionsPaused: true,
        defaultOverlapMode: "priority",
        products: productRows,
        overlays: []
      });
      bundleRowsRaw = [];
    }
  } else {
    priceMap = buildStorefrontListingUnitPriceMap({
      promotionsPaused: false,
      defaultOverlapMode: "priority",
      products: productRows,
      overlays: []
    });
  }

  const products = productRows.map((row) => mapHomeSectionProduct(row, priceMap, bundleRowsRaw));
  const categories = categoryRows.map(mapHomeSectionCategory);

  return rows.map((row) => {
    const type = row.type;
    const base = {
      id: row.id,
      type,
      title: row.title,
      sortOrder: row.sort_order
    };
    if (type === "buy_x_get_y") {
      const buyQty = row.buy_qty == null ? null : Number(row.buy_qty);
      const getQty = row.get_qty == null ? null : Number(row.get_qty);
      return {
        ...base,
        buyQty: Number.isInteger(buyQty) ? buyQty : null,
        getQty: Number.isInteger(getQty) ? getQty : null,
        label: bxgyLabel(buyQty, getQty),
        promotionId: row.promotion_id ?? null,
        buyProducts: orderByIds(products, asIdList(row.buy_product_ids)),
        getProducts: orderByIds(products, asIdList(row.get_product_ids))
      };
    }
    return {
      ...base,
      startsAt: type === "event_shelf" ? isoOrNull(row.starts_at) : null,
      endsAt: type === "event_shelf" ? isoOrNull(row.ends_at) : null,
      categories: orderByIds(categories, asIdList(row.category_ids)),
      products: orderByIds(products, asIdList(row.product_ids))
    };
  });
}
