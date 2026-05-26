import { getRequestLogger } from "../../../infra/logging/requestContext.js";
import {
  buildStorefrontListingUnitPriceMap,
  withStorefrontDetailPricing
} from "../promotions/resolveStorefrontSkuUnitPrices.js";
import {
  filterBundleRuleRowsForProduct,
  mapActiveBundleRuleRow
} from "../promotions/mapActiveBundleRulesPublic.js";

/**
 * @param {Array<{ global_category_id: string }>} rules
 */
function categoryDiscountRulesByCategoryMap(rules) {
  const map = new Map();
  for (const r of rules) {
    const id = String(r.global_category_id);
    if (!map.has(id)) {
      map.set(id, []);
    }
    map.get(id).push(r);
  }
  return map;
}
import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";

function catalogOnlyPromotionContext(pageRows) {
  return {
    promotionsPaused: false,
    priceMap: buildStorefrontListingUnitPriceMap({
      promotionsPaused: false,
      defaultOverlapMode: "priority",
      products: pageRows,
      overlays: []
    }),
    bundleRowsRaw: []
  };
}

/**
 * Storefront catalog promotion reads (requires an active PoolClient).
 * @param {{
 *   promotionRepo?: import("../../ports/repositories/PromotionRepo.js").PromotionRepo,
 *   shopPromotionCache?: ReturnType<import("../../../infra/cache/shopPromotionCache.js").createShopPromotionCache>
 * }} deps
 */
export function createStorefrontListingPromotions({ promotionRepo, shopPromotionCache }) {
  const promoReads = shopPromotionCache ?? promotionRepo;

  async function loadListingContext(client, shopId, pageRows) {
    if (!pageRows.length) {
      return {
        promotionsPaused: false,
        priceMap: new Map(),
        bundleRowsRaw: []
      };
    }
    if (!promoReads) {
      return catalogOnlyPromotionContext(pageRows);
    }
    try {
      const rawSettings = await promoReads.getShopPromotionSettings(client, shopId);
      const promotionsPaused = rawSettings?.promotions_paused === true;
      const defaultOverlapMode =
        rawSettings?.default_overlap_mode === "best_for_customer" ? "best_for_customer" : "priority";
      const ids = pageRows.map((r) => r.id);
      const overlays = promotionsPaused
        ? []
        : await promoReads.listActivePromotionProductOverlaysForShopProducts(client, shopId, ids);
      const bundleRowsRaw = promotionsPaused
        ? []
        : await promoReads.listActiveBundleRulesForShop(client, shopId);
      return {
        promotionsPaused,
        priceMap: buildStorefrontListingUnitPriceMap({
          promotionsPaused,
          defaultOverlapMode,
          products: pageRows,
          overlays
        }),
        bundleRowsRaw
      };
    } catch (err) {
      getRequestLogger().warn(
        { err, shopId, event: "storefront_listing_promotions_fallback" },
        "Promotion read failed; returning catalog-only prices"
      );
      return catalogOnlyPromotionContext(pageRows);
    }
  }

  function mapProductDetailBase(data) {
    const { product, gallery } = data;
    let images = gallery.map((g) => {
      const out = {
        sortOrder: g.sort_order,
        contentType: g.content_type,
        url: g.url ?? toPublicMediaUrl(g.storage_key)
      };
      if (g.media_asset_id != null) {
        out.mediaAssetId = g.media_asset_id;
      }
      if (g.storage_key != null) {
        out.storageKey = g.storage_key;
      }
      return out;
    });
    const globalImageUrl =
      typeof product.global_image_url === "string" && product.global_image_url !== ""
        ? product.global_image_url
        : null;
    if (images.length === 0 && globalImageUrl) {
      images = [{ sortOrder: 0, contentType: null, url: globalImageUrl }];
    }
    if (globalImageUrl) {
      images = [{ sortOrder: 0, contentType: null, url: globalImageUrl }];
    }
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      unit: product.base_unit,
      unit_size: product.unit_size != null ? String(product.unit_size) : "1",
      availability: product.availability,
      category_id: product.category_id,
      images
    };
  }

  async function enrichProductDetail(client, shopId, data) {
    const base = mapProductDetailBase(data);
    const row = data.product;
    const idStr = String(row.id);
    if (!promoReads) {
      const priceMap = buildStorefrontListingUnitPriceMap({
        promotionsPaused: false,
        defaultOverlapMode: "priority",
        products: [row],
        overlays: []
      });
      const entry = priceMap.get(idStr);
      const priced = withStorefrontDetailPricing(base, row, entry?.promoPriceMinor ?? null);
      return { ...priced, bundle_rules: [] };
    }
    try {
      const rawSettings = await promoReads.getShopPromotionSettings(client, shopId);
      const promotionsPaused = rawSettings?.promotions_paused === true;
      const defaultOverlapMode =
        rawSettings?.default_overlap_mode === "best_for_customer" ? "best_for_customer" : "priority";
      const overlays = promotionsPaused
        ? []
        : await promoReads.listActivePromotionProductOverlaysForShopProducts(client, shopId, [row.id]);
      const priceMap = buildStorefrontListingUnitPriceMap({
        promotionsPaused,
        defaultOverlapMode,
        products: [row],
        overlays
      });
      const entry = priceMap.get(idStr);
      const priced = withStorefrontDetailPricing(base, row, entry?.promoPriceMinor ?? null);
      const bundleRows = promotionsPaused
        ? []
        : await promoReads.listActiveBundleRulesForProduct(client, shopId, row.id, row.category_id ?? null);
      return {
        ...priced,
        bundle_rules: bundleRows.map(mapActiveBundleRuleRow)
      };
    } catch (err) {
      getRequestLogger().warn(
        { err, shopId, event: "storefront_detail_promotions_fallback" },
        "Promotion read failed; returning catalog-only prices for product detail"
      );
      const priceMap = buildStorefrontListingUnitPriceMap({
        promotionsPaused: false,
        defaultOverlapMode: "priority",
        products: [row],
        overlays: []
      });
      const entry = priceMap.get(idStr);
      const priced = withStorefrontDetailPricing(base, row, entry?.promoPriceMinor ?? null);
      return { ...priced, bundle_rules: [] };
    }
  }

  async function loadCategoryListingContext(client, shopId) {
    if (!promoReads) {
      return {
        promotionsPaused: false,
        skuPromoCategoryIds: new Set(),
        categoryDiscountRulesByCategory: new Map(),
        bundleRowsRaw: []
      };
    }
    try {
      const rawSettings = await promoReads.getShopPromotionSettings(client, shopId);
      const promotionsPaused = rawSettings?.promotions_paused === true;
      if (promotionsPaused) {
        return {
          promotionsPaused: true,
          skuPromoCategoryIds: new Set(),
          categoryDiscountRulesByCategory: new Map(),
          bundleRowsRaw: []
        };
      }
      const signals =
        typeof promoReads.listActiveCategoryPromotionSignals === "function"
          ? await promoReads.listActiveCategoryPromotionSignals(client, shopId)
          : { skuPromoCategoryIds: [], categoryDiscountRules: [] };
      const bundleRowsRaw = await promoReads.listActiveBundleRulesForShop(client, shopId);
      return {
        promotionsPaused: false,
        skuPromoCategoryIds: new Set(
          (signals.skuPromoCategoryIds ?? []).map((id) => String(id))
        ),
        categoryDiscountRulesByCategory: categoryDiscountRulesByCategoryMap(
          signals.categoryDiscountRules ?? []
        ),
        bundleRowsRaw
      };
    } catch (err) {
      getRequestLogger().warn(
        { err, shopId, event: "storefront_category_promotions_fallback" },
        "Category promotion read failed; returning catalog-only categories"
      );
      return {
        promotionsPaused: false,
        skuPromoCategoryIds: new Set(),
        categoryDiscountRulesByCategory: new Map(),
        bundleRowsRaw: []
      };
    }
  }

  return {
    loadListingContext,
    loadCategoryListingContext,
    enrichProductDetail,
    filterBundleRuleRowsForProduct,
    mapActiveBundleRuleRow
  };
}
