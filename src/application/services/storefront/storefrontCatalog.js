import { requireShopId } from "../catalog/catalogShopId.js";
import { toIlikePattern } from "../catalog/catalogSearchPattern.js";

/**
 * Purpose: This file contains storefront catalog business logic.
 * It validates shop context, handles pagination cursors, applies caching,
 * and maps database rows into API-friendly product/category responses.
 */
const CACHE_TTL_SEC = 60;

function mapCategoryRow(r) {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    parent_id: r.parent_id,
    sort_order: r.sort_order,
    image:
      r.image_storage_key != null
        ? {
            mediaAssetId: r.image_media_id,
            storageKey: r.image_storage_key,
            contentType: r.image_content_type
          }
        : null
  };
}

function mapProductRow(r) {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    price_minor_per_unit: r.price_minor_per_unit,
    availability: r.availability,
    unit: r.base_unit,
    thumbnail:
      r.thumb_storage_key != null
        ? {
            mediaAssetId: r.thumb_media_id,
            storageKey: r.thumb_storage_key,
            contentType: r.thumb_content_type
          }
        : null,
    created_at: r.created_at,
    category_id: r.category_id
  };
}

export function createStorefrontCatalog({ catalogRepo, ensureShopForCatalog, catalogCache }) {
  return {
    async listCategories(shopIdRaw, { parentId }) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const key = `shop:${shopId}:categories:${parentId ?? "root"}`;
      return catalogCache.wrap(key, CACHE_TTL_SEC, async () => {
        const rows = await catalogRepo.listCategoriesStorefront(shopId, { parentId });
        return rows.map(mapCategoryRow);
      });
    },

    async listProducts(shopIdRaw, { categoryId, search, limit, cursor, availability }) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const lim = Math.min(Math.max(Number(limit) || 24, 1), 100);
      let cursorCreatedAt = null;
      let cursorId = null;
      if (cursor) {
        try {
          const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
          if (parsed.t && parsed.id) {
            cursorCreatedAt = parsed.t;
            cursorId = parsed.id;
          }
        } catch {
        }
      }
      const qPattern = toIlikePattern(search ?? null);
      const key = `shop:${shopId}:products:v1:${categoryId ?? "all"}:${qPattern ?? "q"}:${availability ?? "any"}:${lim}:cur:${cursor ?? "none"}`;
      const items = await catalogCache.wrap(key, CACHE_TTL_SEC, async () => {
        const rows = await catalogRepo.listProductsStorefront(shopId, {
          categoryId: categoryId ?? null,
          qPattern,
          limit: lim + 1,
          cursorCreatedAt,
          cursorId,
          availability: availability ?? null
        });
        return rows;
      });
      const hasMore = items.length > lim;
      const page = hasMore ? items.slice(0, lim) : items;
      const last = page[page.length - 1];
      const nextCursor =
        hasMore && last
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
      const data = await catalogCache.wrap(key, CACHE_TTL_SEC, async () => catalogRepo.getProductBySlugStorefront(shopId, slug));
      if (!data) return null;
      const { product, gallery } = data;
      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        unit: product.base_unit,
        price_minor_per_unit: product.price_minor_per_unit,
        availability: product.availability,
        category_id: product.category_id,
        images: gallery.map((g) => ({
          mediaAssetId: g.media_asset_id,
          sortOrder: g.sort_order,
          storageKey: g.storage_key,
          contentType: g.content_type
        }))
      };
    }
  };
}
