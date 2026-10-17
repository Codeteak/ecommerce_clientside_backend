import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";
import {
  buildStorefrontListingUnitPriceMap,
  computeStorefrontUnitPricing
} from "../promotions/resolveStorefrontSkuUnitPrices.js";
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
export function mapHomeSectionProduct(row, priceMap = null, bundleRowsRaw = [], productNameById = null) {
  const globalImageUrl =
    typeof row.global_image_url === "string" && row.global_image_url !== "" ? row.global_image_url : null;
  const imageUrl = globalImageUrl ?? toPublicMediaUrl(row.thumb_storage_key);
  const id = String(row.id);
  const listMinor = priceMinor(row.price_minor_per_unit);
  const offerMinor = priceMinor(row.offer_price_minor_per_unit);
  const promoEntry = priceMap?.get(id);
  const promoPriceMinor = promoEntry?.promoPriceMinor ?? null;
  // Match checkout engine: promo replaces baseline (does not min() with a worse promo).
  const priced = computeStorefrontUnitPricing(
    listMinor,
    offerMinor,
    promoPriceMinor
  );
  const finalMinor = priced.finalMinor;

  const categoryId = row.category_id != null ? String(row.category_id) : null;
  const bundleRules = filterBundleRuleRowsForProduct(bundleRowsRaw, id, categoryId).map((r) => {
    const mapped = mapActiveBundleRuleRow(r);
    if (productNameById && typeof productNameById.get === "function") {
      const buyId = mapped.buy_shop_product_id
        ? String(mapped.buy_shop_product_id)
        : mapped.shop_product_id
          ? String(mapped.shop_product_id)
          : "";
      const getId = mapped.reward_shop_product_id ? String(mapped.reward_shop_product_id) : "";
      if (buyId && productNameById.get(buyId)) mapped.buy_product_name = productNameById.get(buyId);
      if (getId && productNameById.get(getId)) mapped.reward_product_name = productNameById.get(getId);
    }
    return mapped;
  });

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
    stock_quantity:
      row.stock_quantity != null && String(row.stock_quantity).trim() !== ""
        ? String(row.stock_quantity)
        : null,
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

export function bxgyLabel(buyQty, getQty, dealMode = "same_sku") {
  const buy = Number.isInteger(buyQty) ? buyQty : 1;
  const get = Number.isInteger(getQty) ? getQty : 1;
  if (dealMode === "cross_sku") {
    if (buy === 1 && get === 1) return "Buy this → get that free";
    return `Buy ${buy} → get ${get} free`;
  }
  if (buy === 1 && get === 1) return "Buy 1 Get 1 Free";
  return `Buy ${buy} Get ${get} Free`;
}

/** same_sku = classic BOGO; cross_sku = buy list unlocks different get products. */
export function bxgyDealMode(buyProductIds, getProductIds) {
  const buys = asIdList(buyProductIds);
  const gets = asIdList(getProductIds);
  if (gets.length === 0) return "same_sku";
  if (buys.length === gets.length && buys.every((id) => gets.includes(id))) {
    return "same_sku";
  }
  return "cross_sku";
}

export function isoOrNull(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/** Cap matches admin MAX_PRODUCTS_PER_SECTION. */
export const STOREFRONT_SHELF_PRODUCT_CAP = 50;

/**
 * Explicit product_ids first, then category-expanded fillers, de-duped, capped.
 * @param {string[]} explicitIds
 * @param {{ id: string }[]} categoryProductRows
 */
export function mergeShelfProductIds(explicitIds, categoryProductRows) {
  const out = [];
  const seen = new Set();
  for (const id of asIdList(explicitIds)) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= STOREFRONT_SHELF_PRODUCT_CAP) return out;
  }
  for (const row of Array.isArray(categoryProductRows) ? categoryProductRows : []) {
    const id = row?.id != null ? String(row.id) : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= STOREFRONT_SHELF_PRODUCT_CAP) break;
  }
  return out;
}

/**
 * Pair BXGY rules into customer-facing deals with correct buy/get qty from the engine.
 */
export function buildBxgyDealsForSection({
  buyIds,
  getIds,
  sectionBuyQty,
  sectionGetQty,
  products,
  bundleRowsRaw
}) {
  const buySet = new Set(asIdList(buyIds).map(String));
  const getSet = new Set(asIdList(getIds).map(String));
  const defaultBuyQty =
    Number.isInteger(sectionBuyQty) && sectionBuyQty > 0 ? sectionBuyQty : 1;
  const defaultGetQty =
    Number.isInteger(sectionGetQty) && sectionGetQty > 0 ? sectionGetQty : 1;
  const productById = new Map(
    (Array.isArray(products) ? products : []).map((p) => [String(p.id), p])
  );
  const deals = [];
  const seen = new Set();

  const pushDeal = (deal) => {
    const buyP = deal.buyProducts?.[0];
    const getP = deal.getProducts?.[0];
    if (!buyP || !getP) return;
    const key = `${deal.dealMode}:${buyP.id}:${getP.id}:${deal.buyQty}:${deal.getQty}`;
    if (seen.has(key)) return;
    seen.add(key);
    deals.push(deal);
  };

  for (const r of Array.isArray(bundleRowsRaw) ? bundleRowsRaw : []) {
    const bq =
      Number.isInteger(Number(r.buy_qty)) && Number(r.buy_qty) > 0
        ? Number(r.buy_qty)
        : defaultBuyQty;
    const gq =
      Number.isInteger(Number(r.get_qty)) && Number(r.get_qty) > 0
        ? Number(r.get_qty)
        : defaultGetQty;

    if (r.scope === "same_shop_product" && r.shop_product_id) {
      const id = String(r.shop_product_id);
      if ((buySet.size > 0 || getSet.size > 0) && !buySet.has(id) && !getSet.has(id)) {
        continue;
      }
      const p = productById.get(id);
      if (!p) continue;
      pushDeal({
        id: `same-${id}-${bq}-${gq}`,
        dealMode: "same_sku",
        buyQty: bq,
        getQty: gq,
        buyProducts: [p],
        getProducts: [p],
        headline: bxgyLabel(bq, gq, "same_sku")
      });
      continue;
    }

    if (r.scope === "cross_shop_products") {
      const buyId = r.buy_shop_product_id ? String(r.buy_shop_product_id) : "";
      const getId = r.reward_shop_product_id ? String(r.reward_shop_product_id) : "";
      if (!buyId || !getId || buyId === getId) continue;
      if (buySet.size && !buySet.has(buyId)) continue;
      if (getSet.size && !getSet.has(getId)) continue;
      const buyP = productById.get(buyId);
      const getP = productById.get(getId);
      if (!buyP || !getP) continue;
      const buyName = buyP.name || "";
      const getName = getP.name || "";
      pushDeal({
        id: `cross-${buyId}-${getId}-${bq}-${gq}`,
        dealMode: "cross_sku",
        buyQty: bq,
        getQty: gq,
        buyProducts: [buyP],
        getProducts: [getP],
        headline:
          buyName && getName
            ? bq === 1 && gq === 1
              ? `Buy ${buyName} → ${getName} free`
              : `Buy ${bq} ${buyName} → ${gq} ${getName} free`
            : bxgyLabel(bq, gq, "cross_sku")
      });
    }
  }

  if (deals.length === 0) {
    const buys = orderByIds(products, buyIds);
    const gets = orderByIds(products, getIds);
    const mode = bxgyDealMode(buyIds, getIds);
    if (mode === "same_sku") {
      for (const p of buys.length ? buys : gets) {
        pushDeal({
          id: `same-fb-${p.id}`,
          dealMode: "same_sku",
          buyQty: defaultBuyQty,
          getQty: defaultGetQty,
          buyProducts: [p],
          getProducts: [p],
          headline: bxgyLabel(defaultBuyQty, defaultGetQty, "same_sku")
        });
      }
    } else if (buys.length && gets.length) {
      const n = Math.min(buys.length, gets.length);
      for (let i = 0; i < n; i++) {
        const b = buys[i];
        const g = gets[i];
        pushDeal({
          id: `cross-fb-${b.id}-${g.id}`,
          dealMode: "cross_sku",
          buyQty: defaultBuyQty,
          getQty: defaultGetQty,
          buyProducts: [b],
          getProducts: [g],
          headline:
            b.name && g.name
              ? defaultBuyQty === 1 && defaultGetQty === 1
                ? `Buy ${b.name} → ${g.name} free`
                : `Buy ${defaultBuyQty} ${b.name} → ${defaultGetQty} ${g.name} free`
              : bxgyLabel(defaultBuyQty, defaultGetQty, "cross_sku")
        });
      }
    }
  }

  return deals;
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
/**
 * Expand category_ids → sellable products for product/event shelves (parallel per section).
 * @returns {Promise<Map<string, unknown[]>>} sectionId → category product rows
 */
async function loadCategoryProductsBySection(catalogRepo, shopId, rows) {
  const map = new Map();
  const jobs = [];
  for (const row of rows) {
    if (row.type === "buy_x_get_y") continue;
    const cats = asIdList(row.category_ids);
    if (!cats.length) {
      map.set(String(row.id), []);
      continue;
    }
    if (typeof catalogRepo.listSellableProductsByCategoryIdsStorefront !== "function") {
      map.set(String(row.id), []);
      continue;
    }
    jobs.push(
      catalogRepo
        .listSellableProductsByCategoryIdsStorefront(shopId, cats, STOREFRONT_SHELF_PRODUCT_CAP)
        .then((prods) => {
          map.set(String(row.id), Array.isArray(prods) ? prods : []);
        })
        .catch(() => {
          map.set(String(row.id), []);
        })
    );
  }
  if (jobs.length) await Promise.all(jobs);
  return map;
}

export async function resolveStorefrontHomeSections(catalogRepo, shopId, opts = {}) {
  const rows = await catalogRepo.listEnabledHomeSectionsStorefront(shopId);
  if (!rows.length) return [];

  const categoryProductsBySection = await loadCategoryProductsBySection(catalogRepo, shopId, rows);

  const productIds = [];
  const categoryIds = [];
  const shelfMergedIdsBySection = new Map();

  for (const row of rows) {
    categoryIds.push(...asIdList(row.category_ids));
    if (row.type === "buy_x_get_y") {
      productIds.push(...asIdList(row.buy_product_ids), ...asIdList(row.get_product_ids));
      continue;
    }
    const merged = mergeShelfProductIds(
      row.product_ids,
      categoryProductsBySection.get(String(row.id)) || []
    );
    shelfMergedIdsBySection.set(String(row.id), merged);
    productIds.push(...merged);
  }

  // Also include raw category-expanded rows so we don't re-fetch them by id.
  const categoryRowById = new Map();
  for (const prods of categoryProductsBySection.values()) {
    for (const p of prods) {
      if (p?.id != null) categoryRowById.set(String(p.id), p);
    }
  }

  const uniqueIds = [...new Set(productIds)];
  const missingIds = uniqueIds.filter((id) => !categoryRowById.has(id));

  const [fetchedById, categoryRows] = await Promise.all([
    catalogRepo.listSellableProductsByIdsStorefront(shopId, missingIds),
    catalogRepo.listActiveCategoriesByIdsStorefront(shopId, [...new Set(categoryIds)])
  ]);

  const productRowById = new Map(categoryRowById);
  for (const row of fetchedById) {
    productRowById.set(String(row.id), row);
  }
  const productRows = uniqueIds.map((id) => productRowById.get(id)).filter(Boolean);

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

  const productNameById = new Map(
    productRows.map((row) => [String(row.id), String(row.name || "")]).filter(([, n]) => n)
  );
  const products = productRows.map((row) =>
    mapHomeSectionProduct(row, priceMap, bundleRowsRaw, productNameById)
  );
  const categories = categoryRows.map(mapHomeSectionCategory);

  const out = [];
  for (const row of rows) {
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
      const buyIds = asIdList(row.buy_product_ids);
      const getIds = asIdList(row.get_product_ids);
      const dealMode = bxgyDealMode(buyIds, getIds);
      const deals = buildBxgyDealsForSection({
        buyIds,
        getIds,
        sectionBuyQty: Number.isInteger(buyQty) ? buyQty : 1,
        sectionGetQty: Number.isInteger(getQty) ? getQty : 1,
        products,
        bundleRowsRaw
      });
      const labelQtyBuy = deals[0]?.buyQty ?? (Number.isInteger(buyQty) ? buyQty : 1);
      const labelQtyGet = deals[0]?.getQty ?? (Number.isInteger(getQty) ? getQty : 1);
      out.push({
        ...base,
        buyQty: Number.isInteger(buyQty) ? buyQty : null,
        getQty: Number.isInteger(getQty) ? getQty : null,
        dealMode,
        label: bxgyLabel(labelQtyBuy, labelQtyGet, dealMode),
        promotionId: row.promotion_id ?? null,
        startsAt: isoOrNull(row.starts_at),
        endsAt: isoOrNull(row.ends_at),
        buyProducts: orderByIds(products, buyIds),
        getProducts: orderByIds(products, getIds),
        deals
      });
      continue;
    }

    const mergedIds = shelfMergedIdsBySection.get(String(row.id)) || asIdList(row.product_ids);
    const shelfProducts = orderByIds(products, mergedIds);
    // Hide empty product/event shelves (categories-only with no sellable SKUs).
    if (shelfProducts.length === 0) continue;
    out.push({
      ...base,
      startsAt: isoOrNull(row.starts_at),
      endsAt: isoOrNull(row.ends_at),
      categories: orderByIds(categories, asIdList(row.category_ids)),
      products: shelfProducts
    });
  }
  return out;
}

/**
 * Deep-link lookup for /events?id=… — explains why a section is not shoppable.
 * @returns {Promise<{
 *   status: 'ok'|'not_found'|'deleted'|'wrong_type'|'disabled'|'scheduled'|'expired'|'empty',
 *   section: object | null,
 *   title: string | null,
 *   type: string | null
 * }>}
 */
export async function lookupStorefrontHomeSection(catalogRepo, shopId, sectionId, opts = {}) {
  const empty = {
    status: "not_found",
    section: null,
    title: null,
    type: null
  };
  if (typeof catalogRepo.getHomeSectionByIdStorefront !== "function") {
    return empty;
  }
  const row = await catalogRepo.getHomeSectionByIdStorefront(shopId, sectionId);
  if (!row) return empty;

  const title = row.title != null ? String(row.title) : null;
  const type = row.type != null ? String(row.type) : null;
  const base = { title, type, section: null };

  if (row.deleted_at) return { ...base, status: "deleted" };
  if (type !== "event_shelf") return { ...base, status: "wrong_type" };
  if (row.is_enabled !== true) return { ...base, status: "disabled" };

  const now = Date.now();
  if (row.starts_at) {
    const t = new Date(row.starts_at).getTime();
    if (Number.isFinite(t) && t > now) return { ...base, status: "scheduled" };
  }
  if (row.ends_at) {
    const t = new Date(row.ends_at).getTime();
    if (Number.isFinite(t) && t < now) return { ...base, status: "expired" };
  }

  // Reuse list resolver path: resolve only this row as if enabled.
  const fakeRepo = {
    listEnabledHomeSectionsStorefront: async () => [row],
    listSellableProductsByIdsStorefront: (...a) =>
      catalogRepo.listSellableProductsByIdsStorefront(...a),
    listSellableProductsByCategoryIdsStorefront: (...a) =>
      typeof catalogRepo.listSellableProductsByCategoryIdsStorefront === "function"
        ? catalogRepo.listSellableProductsByCategoryIdsStorefront(...a)
        : Promise.resolve([]),
    listActiveCategoriesByIdsStorefront: (...a) =>
      catalogRepo.listActiveCategoriesByIdsStorefront(...a)
  };
  const sections = await resolveStorefrontHomeSections(fakeRepo, shopId, opts);
  const section = sections[0] || null;
  if (!section || !Array.isArray(section.products) || section.products.length === 0) {
    return { ...base, status: "empty" };
  }
  return { status: "ok", section, title, type };
}
