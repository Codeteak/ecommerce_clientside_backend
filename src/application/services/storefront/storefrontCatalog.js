import { requireShopId } from "../catalog/catalogShopId.js";
import { toIlikePattern } from "../catalog/catalogSearchPattern.js";
import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import {
  mapStorefrontCategoryRow as mapCategoryRow,
  mapStorefrontProductRow as mapProductRow
} from "./storefrontCatalogMappers.js";

/**
 * Purpose: This file contains storefront catalog business logic.
 * It validates shop context, handles pagination cursors, applies caching,
 * and maps database rows into API-friendly product/category responses.
 */

export function createStorefrontCatalog({
  catalogRepo,
  ensureShopForCatalog,
  catalogCache,
  catalogCacheTtlSec = 60
}) {
  const ttl = Number(catalogCacheTtlSec) || 0;

  async function cached(key, fn) {
    if (ttl <= 0) {
      return fn();
    }
    return catalogCache.wrap(key, ttl, fn);
  }

  return {
    async listCategories(shopIdRaw, { parentId, all = false } = {}) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const key = all ? `shop:${shopId}:categories:all` : `shop:${shopId}:categories:${parentId ?? "root"}`;
      return cached(key, async () => {
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
      const key = `shop:${shopId}:products:v3:${categoryId ?? "all"}:${brandId ?? "all"}:${qPattern ?? "q"}:${availability ?? "any"}:${minPriceMinor ?? "min"}:${maxPriceMinor ?? "max"}:${resolvedSortBy}:${resolvedSortOrder}:${lim}:cur:${cursor ?? "none"}:off:${offsetValue ?? "none"}`;
      const items = await cached(key, async () => {
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
      return {
        products: page.map(mapProductRow),
        nextCursor
      };
    },

    async getProductBySlug(shopIdRaw, slug) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const key = `shop:${shopId}:product:${String(slug).toLowerCase()}`;
      const data = await cached(key, async () => catalogRepo.getProductBySlugStorefront(shopId, slug));
      if (!data) return null;
      const { product, gallery } = data;
      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        unit: product.base_unit,
        price_minor_per_unit: product.price_minor_per_unit,
        offer_price_minor_per_unit: product.offer_price_minor_per_unit,
        availability: product.availability,
        category_id: product.category_id,
        images: gallery.map((g) => ({
          mediaAssetId: g.media_asset_id,
          sortOrder: g.sort_order,
          storageKey: g.storage_key,
          contentType: g.content_type,
          url: toPublicMediaUrl(g.storage_key)
        }))
      };
    },

    async getProductById(shopIdRaw, id) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const key = `shop:${shopId}:product:id:${String(id).toLowerCase()}`;
      const data = await cached(key, async () => catalogRepo.getProductByIdStorefront(shopId, id));
      if (!data) return null;
      const { product, gallery } = data;
      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        unit: product.base_unit,
        price_minor_per_unit: product.price_minor_per_unit,
        offer_price_minor_per_unit: product.offer_price_minor_per_unit,
        availability: product.availability,
        category_id: product.category_id,
        images: gallery.map((g) => ({
          mediaAssetId: g.media_asset_id,
          sortOrder: g.sort_order,
          storageKey: g.storage_key,
          contentType: g.content_type,
          url: toPublicMediaUrl(g.storage_key)
        }))
      };
    },

    async getCategoryBySlug(shopIdRaw, slug) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const key = `shop:${shopId}:category:${String(slug).toLowerCase()}`;
      const row = await cached(key, async () => catalogRepo.getCategoryBySlugStorefront(shopId, slug));
      if (!row) return null;
      return mapCategoryRow(row);
    }
  };
}
