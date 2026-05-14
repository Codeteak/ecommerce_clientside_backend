import { requireShopId } from "../catalog/catalogShopId.js";
import { toIlikePattern } from "../catalog/catalogSearchPattern.js";
import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import {
  buildStorefrontListingUnitPriceMap,
  withStorefrontProductPricing,
  withStorefrontDetailPricing
} from "../promotions/resolveStorefrontSkuUnitPrices.js";
import {
  filterBundleRuleRowsForProduct,
  mapActiveBundleRuleRow
} from "../promotions/mapActiveBundleRulesPublic.js";
import {
  mapStorefrontCategoryRow as mapCategoryRow,
  mapStorefrontProductRow as mapProductRow
} from "./storefrontCatalogMappers.js";
import { logger } from "../../../config/logger.js";

/** @param {{ promotions_paused?: boolean, products?: unknown[], categories?: unknown[], nextCursor?: string | null }} body */
function pruneStorefrontProductListPayload(body) {
  const out = {};
  if (body.promotions_paused === true) {
    out.promotions_paused = true;
  }
  if (Array.isArray(body.products) && body.products.length > 0) {
    out.products = body.products;
  }
  if (Array.isArray(body.categories) && body.categories.length > 0) {
    out.categories = body.categories;
  }
  if (body.nextCursor != null && body.nextCursor !== "") {
    out.nextCursor = body.nextCursor;
  }
  return out;
}

/**
 * Purpose: This file contains storefront catalog business logic.
 * It validates shop context, handles pagination cursors, applies caching,
 * and maps database rows into API-friendly product/category responses.
 */

export function createStorefrontCatalog({
  catalogRepo,
  ensureShopForCatalog,
  catalogCache,
  catalogCacheTtlSec = 60,
  pool = null,
  promotionRepo = null
}) {
  const ttl = Number(catalogCacheTtlSec) || 0;
  // Keep SWR freshness aligned with configured catalog TTL so updates
  // are reflected within the expected minute-level window.
  const swrTtlSec = ttl > 0 ? ttl : 0;

  function mapProductDetailImage(g) {
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
  }

  function mapProductDetail(data) {
    const { product, gallery } = data;
    let images = gallery.map(mapProductDetailImage);
    const globalImageUrl =
      typeof product.global_image_url === "string" && product.global_image_url !== "" ? product.global_image_url : null;
    if (images.length === 0 && globalImageUrl) {
      images = [
        {
          sortOrder: 0,
          contentType: null,
          url: globalImageUrl
        }
      ];
    }
    if (globalImageUrl) {
      images = [
        {
          sortOrder: 0,
          contentType: null,
          url: globalImageUrl
        }
      ];
    }
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      unit: product.base_unit,
      availability: product.availability,
      category_id: product.category_id,
      images
    };
  }

  async function cachedSWR(shopId, key, label, fn, ttlOverride = null) {
    const effective = ttlOverride != null ? ttlOverride : swrTtlSec;
    if (effective <= 0) {
      return fn();
    }
    return catalogCache.swr(key, effective, fn, { logLabel: label, shopId });
  }

  /**
   * When there are no campaigns, paused promos, or promotion DB reads fail:
   * catalog-only pricing (`promo_price_minor` null) and no bundle rules.
   */
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
   * Loads shop promo settings, SKU overlays, bundle rows (raw); runs outside catalog SWR.
   */
  async function loadListingPromotionsContext(shopId, pageRows) {
    if (!pageRows.length) {
      return {
        promotionsPaused: false,
        priceMap: new Map(),
        bundleRowsRaw: []
      };
    }
    if (!pool || !promotionRepo) {
      return catalogOnlyPromotionContext(pageRows);
    }
    const client = await pool.connect();
    try {
      try {
        const rawSettings = await promotionRepo.getShopPromotionSettings(client, shopId);
        const promotionsPaused = rawSettings?.promotions_paused === true;
        const defaultOverlapMode =
          rawSettings?.default_overlap_mode === "best_for_customer" ? "best_for_customer" : "priority";
        const ids = pageRows.map((r) => r.id);
        const overlays = promotionsPaused
          ? []
          : await promotionRepo.listActivePromotionProductOverlaysForShopProducts(client, shopId, ids);
        const bundleRowsRaw = promotionsPaused ? [] : await promotionRepo.listActiveBundleRulesForShop(client, shopId);
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
        logger.warn(
          { err, shopId, event: "storefront_listing_promotions_fallback" },
          "Promotion read failed; returning catalog-only prices"
        );
        return catalogOnlyPromotionContext(pageRows);
      }
    } finally {
      client.release();
    }
  }

  async function enrichProductDetailWithPromotions(shopId, data) {
    const base = mapProductDetail(data);
    const row = data.product;
    const idStr = String(row.id);
    if (!pool || !promotionRepo) {
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
    const client = await pool.connect();
    try {
      try {
        const rawSettings = await promotionRepo.getShopPromotionSettings(client, shopId);
        const promotionsPaused = rawSettings?.promotions_paused === true;
        const defaultOverlapMode =
          rawSettings?.default_overlap_mode === "best_for_customer" ? "best_for_customer" : "priority";
        const overlays = promotionsPaused
          ? []
          : await promotionRepo.listActivePromotionProductOverlaysForShopProducts(client, shopId, [row.id]);
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
          : await promotionRepo.listActiveBundleRulesForProduct(client, shopId, row.id, row.category_id ?? null);
        return {
          ...priced,
          bundle_rules: bundleRows.map(mapActiveBundleRuleRow)
        };
      } catch (err) {
        logger.warn(
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
    } finally {
      client.release();
    }
  }

  return {
    async listCategories(shopIdRaw, { parentId, all = false } = {}) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const key = all ? `shop:${shopId}:categories:all` : `shop:${shopId}:categories:${parentId ?? "root"}`;
      return cachedSWR(shopId, key, "categories:list", async () => {
        const rows = all
          ? await catalogRepo.listAllCategoriesStorefront(shopId)
          : await catalogRepo.listCategoriesStorefront(shopId, { parentId });
        return rows.map(mapCategoryRow);
      });
    },

    async listProducts(
      shopIdRaw,
      { categoryId, brandId, search, limit, cursor, offset, availability, minPriceMinor, maxPriceMinor, sortBy, sortOrder }
    ) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const lim = Math.min(Math.max(Number(limit) || 24, 1), 100);
      const resolvedSortBy = sortBy || "created_at";
      const resolvedSortOrder = sortOrder || "desc";
      if (cursor && resolvedSortBy !== "created_at") {
        throw new ValidationError("cursor pagination is only supported with sort_by=created_at");
      }
      const offsetValue = Number.isInteger(offset) ? Math.max(0, offset) : null;
      let cursorCreatedAt = null;
      let cursorId = null;
      if (cursor && offsetValue == null) {
        const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        if (!parsed?.t || !parsed?.id || !Number.isFinite(Date.parse(parsed.t))) {
          throw new ValidationError("cursor is invalid");
        }
        cursorCreatedAt = parsed.t;
        cursorId = parsed.id;
      }
      const qPattern = toIlikePattern(search ?? null);
      const key = `shop:${shopId}:products:v6:${categoryId ?? "all"}:${brandId ?? "all"}:${qPattern ?? "q"}:${availability ?? "any"}:${minPriceMinor ?? "min"}:${maxPriceMinor ?? "max"}:${resolvedSortBy}:${resolvedSortOrder}:${lim}:cur:${cursor ?? "none"}:off:${offsetValue ?? "none"}`;
      const items = await cachedSWR(shopId, key, "products:list", async () => {
        const rows = await catalogRepo.listProductsStorefront(shopId, {
          categoryId: categoryId ?? null,
          brandId: brandId ?? null,
          qPattern,
          limit: offsetValue == null ? lim + 1 : lim,
          offset: offsetValue,
          cursorCreatedAt,
          cursorId,
          availability: availability ?? null,
          minPriceMinor: Number.isInteger(minPriceMinor) ? minPriceMinor : null,
          maxPriceMinor: Number.isInteger(maxPriceMinor) ? maxPriceMinor : null,
          sortBy: resolvedSortBy,
          sortOrder: resolvedSortOrder
        });
        return rows;
      });
      const hasMore = items.length > lim;
      const page = offsetValue == null && hasMore ? items.slice(0, lim) : items;
      const last = page[page.length - 1];
      const nextCursor =
        offsetValue == null && hasMore && last
          ? Buffer.from(
              JSON.stringify({ t: last.created_at, id: last.id }),
              "utf8"
            ).toString("base64url")
          : null;
      const { promotionsPaused, priceMap, bundleRowsRaw } = await loadListingPromotionsContext(shopId, page);
      const mapped = page.map((row) => {
        const base = mapProductRow(row);
        const entry = priceMap.get(String(row.id));
        const promo = entry?.promoPriceMinor ?? null;
        const priced = withStorefrontProductPricing(base, row, promo);
        const subset = filterBundleRuleRowsForProduct(bundleRowsRaw, String(row.id), row.category_id);
        return {
          ...priced,
          bundle_rules: subset.map(mapActiveBundleRuleRow)
        };
      });
      const grouped = new Map();
      for (const p of mapped) {
        const groupId = p.category_id ?? "uncategorized";
        const groupMeta = p.category ?? {
          name: "Uncategorized",
          slug: null,
          parent_id: null,
          image: null
        };
        if (!grouped.has(groupId)) {
          grouped.set(groupId, {
            id: groupId,
            name: groupMeta.name,
            slug: groupMeta.slug,
            parent_id: groupMeta.parent_id,
            image: groupMeta.image,
            products: []
          });
        }
        const categoryProduct = { ...p };
        delete categoryProduct.category;
        grouped.get(groupId).products.push(categoryProduct);
      }
      return pruneStorefrontProductListPayload({
        promotions_paused: promotionsPaused,
        products: mapped,
        categories: Array.from(grouped.values()),
        nextCursor
      });
    },

    async getProductBySlug(shopIdRaw, slug) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const key = `shop:${shopId}:product:${String(slug).toLowerCase()}`;
      const data = await cachedSWR(
        shopId,
        key,
        "products:detail:slug",
        async () => catalogRepo.getProductBySlugStorefront(shopId, slug),
        swrTtlSec
      );
      if (!data) return null;
      return enrichProductDetailWithPromotions(shopId, data);
    },

    async getProductById(shopIdRaw, id) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const key = `shop:${shopId}:product:id:${String(id).toLowerCase()}`;
      const data = await cachedSWR(
        shopId,
        key,
        "products:detail:id",
        async () => catalogRepo.getProductByIdStorefront(shopId, id),
        swrTtlSec
      );
      if (!data) return null;
      return enrichProductDetailWithPromotions(shopId, data);
    },

    async getCategoryBySlug(shopIdRaw, slug) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const key = `shop:${shopId}:category:${String(slug).toLowerCase()}`;
      const row = await cachedSWR(
        shopId,
        key,
        "categories:detail:slug",
        async () => catalogRepo.getCategoryBySlugStorefront(shopId, slug),
        swrTtlSec
      );
      if (!row) return null;
      return mapCategoryRow(row);
    }
  };
}
