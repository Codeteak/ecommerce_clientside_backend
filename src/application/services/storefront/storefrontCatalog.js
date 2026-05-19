import { createHash } from "node:crypto";
import { requireShopId } from "../catalog/catalogShopId.js";
import { resolveStorefrontListAvailability } from "../catalog/resolveStorefrontListAvailability.js";
import { resolveCatalogSearchPattern } from "../catalog/catalogSearchPattern.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { withStorefrontProductPricing } from "../promotions/resolveStorefrontSkuUnitPrices.js";
import {
  mapStorefrontCategoryRow as mapCategoryRow,
  mapStorefrontProductRow as mapProductRow
} from "./storefrontCatalogMappers.js";
import { shouldCacheProductList } from "./shouldCacheProductList.js";
/** @param {{ promotions_paused?: boolean, products?: unknown[], categories?: unknown[], nextCursor?: string | null }} body */
function pruneStorefrontProductListPayload(body, { layout = "grouped" } = {}) {
  const out = {};
  if (body.promotions_paused === true) {
    out.promotions_paused = true;
  }
  const categories = Array.isArray(body.categories) ? body.categories : [];
  const products = Array.isArray(body.products) ? body.products : [];
  const flatLayout = layout === "flat";

  if (flatLayout) {
    if (products.length > 0) {
      out.products = products;
    }
    if (categories.length > 0) {
      out.categories = categories;
    }
  } else if (categories.length > 0) {
    out.categories = categories;
  } else if (products.length > 0) {
    out.products = products;
  }

  if (body.nextCursor != null && body.nextCursor !== "") {
    out.nextCursor = body.nextCursor;
  }
  return out;
}

function listingPromoPageHash(pageRows) {
  const ids = pageRows.map((r) => String(r.id)).sort();
  return createHash("sha256").update(ids.join(",")).digest("hex").slice(0, 16);
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
  shopPromotionCache,
  catalogCacheTtlSec = 60,
  productListCachePolicy = {},
  runWithClient,
  listingPromotions
}) {
  const ttl = Number(catalogCacheTtlSec) || 0;
  // Keep SWR freshness aligned with configured catalog TTL so updates
  // are reflected within the expected minute-level window.
  const swrTtlSec = ttl > 0 ? ttl : 0;

  async function shopPrefix(shopId) {
    if (typeof catalogCache.shopKeyPrefix === "function") {
      return catalogCache.shopKeyPrefix(shopId);
    }
    return `shop:${shopId}:g0:`;
  }

  async function enrichProductDetailCached(shopId, productId, data) {
    const enrich = () =>
      runWithClient((client) => listingPromotions.enrichProductDetail(client, shopId, data));
    if (shopPromotionCache && typeof shopPromotionCache.wrapProductDetailPromo === "function") {
      return shopPromotionCache.wrapProductDetailPromo(shopId, productId, enrich);
    }
    return enrich();
  }

  async function cachedSWR(shopId, keySuffix, label, fn, ttlOverride = null) {
    const effective = ttlOverride != null ? ttlOverride : swrTtlSec;
    if (effective <= 0) {
      return fn();
    }
    const prefix = await shopPrefix(shopId);
    const key = `${prefix}${keySuffix}`;
    return catalogCache.swr(key, effective, fn, { logLabel: label, shopId });
  }

  async function loadListingPromotionsContext(shopId, pageRows) {
    if (!pageRows.length) {
      return {
        promotionsPaused: false,
        priceMap: new Map(),
        bundleRowsRaw: []
      };
    }
    const listingPromoTtlSec = swrTtlSec > 0 ? Math.max(swrTtlSec, 90) : 0;
    if (listingPromoTtlSec <= 0 || typeof catalogCache.wrap !== "function") {
      return runWithClient((client) => listingPromotions.loadListingContext(client, shopId, pageRows));
    }
    const prefix = await shopPrefix(shopId);
    const cacheKey = `${prefix}listingPromo:${listingPromoPageHash(pageRows)}`;
    const cached = await catalogCache.wrap(cacheKey, listingPromoTtlSec, async () => {
      const ctx = await runWithClient((client) => listingPromotions.loadListingContext(client, shopId, pageRows));
      return {
        promotionsPaused: ctx.promotionsPaused,
        bundleRowsRaw: ctx.bundleRowsRaw,
        priceMapEntries: [...ctx.priceMap.entries()]
      };
    });
    if (!cached || typeof cached !== "object") {
      return runWithClient((client) => listingPromotions.loadListingContext(client, shopId, pageRows));
    }
    return {
      promotionsPaused: cached.promotionsPaused === true,
      bundleRowsRaw: Array.isArray(cached.bundleRowsRaw) ? cached.bundleRowsRaw : [],
      priceMap: new Map(Array.isArray(cached.priceMapEntries) ? cached.priceMapEntries : [])
    };
  }

  async function getSellableCategoryIds(shopId) {
    const listingTtl = swrTtlSec > 0 ? Math.max(swrTtlSec, 60) : 0;
    if (listingTtl <= 0 || typeof catalogCache.wrap !== "function") {
      return catalogRepo.listCategoryIdsWithSellableProducts(shopId);
    }
    const prefix = await shopPrefix(shopId);
    const cacheKey = `${prefix}categories:sellableIds`;
    const cached = await catalogCache.wrap(cacheKey, listingTtl, () =>
      catalogRepo.listCategoryIdsWithSellableProducts(shopId)
    );
    return Array.isArray(cached) ? cached : [];
  }

  return {
    async listCategories(shopIdRaw, { parentId, all = false } = {}) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const key = all ? `categories:all` : `categories:${parentId ?? "root"}`;
      return cachedSWR(shopId, key, "categories:list", async () => {
        const sellableCategoryIds = await getSellableCategoryIds(shopId);
        const rows = all
          ? await catalogRepo.listAllCategoriesStorefront(shopId, { sellableCategoryIds })
          : await catalogRepo.listCategoriesStorefront(shopId, { parentId, sellableCategoryIds });
        return rows.map(mapCategoryRow);
      });
    },

    async listProducts(
      shopIdRaw,
      {
        categoryId,
        brandId,
        search,
        limit,
        cursor,
        offset,
        availability,
        includeAllAvailability,
        minPriceMinor,
        maxPriceMinor,
        sortBy,
        sortOrder,
        layout,
        searchMode
      }
    ) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const listAvailability = resolveStorefrontListAvailability(availability, includeAllAvailability);
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
      const resolvedSearchMode = searchMode === "prefix" ? "prefix" : "contains";
      const qPattern = resolveCatalogSearchPattern(search ?? null, resolvedSearchMode);
      const resolvedLayout = layout === "flat" ? "flat" : "grouped";
      const cacheDecision = shouldCacheProductList({
        search,
        qPattern,
        limit: lim,
        cursor,
        offset: offsetValue,
        categoryId,
        brandId,
        minPriceMinor: Number.isInteger(minPriceMinor) ? minPriceMinor : null,
        maxPriceMinor: Number.isInteger(maxPriceMinor) ? maxPriceMinor : null,
        sortBy: resolvedSortBy,
        maxLimit: productListCachePolicy.maxLimit,
        maxOffset: productListCachePolicy.maxOffset,
        searchMinChars: productListCachePolicy.searchMinChars
      });
      const key = `products:list:v9:${categoryId ?? "all"}:${brandId ?? "all"}:${resolvedSearchMode}:${qPattern ?? "q"}:${listAvailability ?? "any"}:${minPriceMinor ?? "min"}:${maxPriceMinor ?? "max"}:${resolvedSortBy}:${resolvedSortOrder}:${lim}:cur:${cursor ?? "none"}:off:${offsetValue ?? "none"}`;
      const loadProducts = async () => {
        const rows = await catalogRepo.listProductsStorefront(shopId, {
          categoryId: categoryId ?? null,
          brandId: brandId ?? null,
          qPattern,
          limit: offsetValue == null ? lim + 1 : lim,
          offset: offsetValue,
          cursorCreatedAt,
          cursorId,
          availability: listAvailability,
          minPriceMinor: Number.isInteger(minPriceMinor) ? minPriceMinor : null,
          maxPriceMinor: Number.isInteger(maxPriceMinor) ? maxPriceMinor : null,
          sortBy: resolvedSortBy,
          sortOrder: resolvedSortOrder
        });
        return rows;
      };
      const items =
        cacheDecision.cache && swrTtlSec > 0
          ? await cachedSWR(shopId, key, "products:list", loadProducts)
          : await loadProducts();
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
        const base = mapProductRow(row, { listView: true });
        const entry = priceMap.get(String(row.id));
        const promo = entry?.promoPriceMinor ?? null;
        const priced = withStorefrontProductPricing(base, row, promo);
        const subset = listingPromotions.filterBundleRuleRowsForProduct(
          bundleRowsRaw,
          String(row.id),
          row.category_id
        );
        return {
          ...priced,
          bundle_rules: subset.map(listingPromotions.mapActiveBundleRuleRow)
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
      return pruneStorefrontProductListPayload(
        {
          promotions_paused: promotionsPaused,
          products: mapped,
          categories: Array.from(grouped.values()),
          nextCursor
        },
        { layout: resolvedLayout }
      );
    },

    async getProductBySlug(shopIdRaw, slug) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const key = `product:slug:${String(slug).toLowerCase()}`;
      const data = await cachedSWR(
        shopId,
        key,
        "products:detail:slug",
        async () => catalogRepo.getProductBySlugStorefront(shopId, slug),
        swrTtlSec
      );
      if (!data) return null;
      return enrichProductDetailCached(shopId, data.product.id, data);
    },

    async getProductById(shopIdRaw, id) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const key = `product:id:${String(id).toLowerCase()}`;
      const data = await cachedSWR(
        shopId,
        key,
        "products:detail:id",
        async () => catalogRepo.getProductByIdStorefront(shopId, id),
        swrTtlSec
      );
      if (!data) return null;
      return enrichProductDetailCached(shopId, id, data);
    },

    async getCategoryBySlug(shopIdRaw, slug) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const key = `category:slug:${String(slug).toLowerCase()}`;
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
