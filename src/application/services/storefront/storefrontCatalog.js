import { requireShopId } from "../catalog/catalogShopId.js";
import { toIlikePattern } from "../catalog/catalogSearchPattern.js";
import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";

/**
 * Purpose: This file contains storefront catalog business logic.
 * It validates shop context, handles pagination cursors, applies caching,
 * and maps database rows into API-friendly product/category responses.
 */

function mapCategoryRow(r) {
  const imageUrl = toPublicMediaUrl(r.image_storage_key);
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
            contentType: r.image_content_type,
            url: imageUrl
          }
        : null
  };
}

function mapProductRow(r) {
  const thumbUrl = toPublicMediaUrl(r.thumb_storage_key);
  const categoryImageUrl = toPublicMediaUrl(r.category_image_storage_key);
  let productImages = [];
  if (Array.isArray(r.product_images)) {
    productImages = r.product_images;
  } else if (typeof r.product_images === "string" && r.product_images.trim()) {
    try {
      const parsed = JSON.parse(r.product_images);
      productImages = Array.isArray(parsed) ? parsed : [];
    } catch {
      productImages = [];
    }
  }
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    price_minor_per_unit: r.price_minor_per_unit,
    offer_price_minor_per_unit: r.offer_price_minor_per_unit,
    availability: r.availability,
    unit: r.base_unit,
    thumbnail:
      r.thumb_storage_key != null
        ? {
            mediaAssetId: r.thumb_media_id,
            storageKey: r.thumb_storage_key,
            contentType: r.thumb_content_type,
            url: thumbUrl
          }
        : null,
    images: productImages.map((img) => ({
      mediaAssetId: img.media_asset_id,
      sortOrder: img.sort_order,
      storageKey: img.storage_key,
      contentType: img.content_type,
      url: toPublicMediaUrl(img.storage_key)
    })),
    category:
      r.category_slug != null
        ? {
            parent_id: r.category_parent_id,
            name: r.category_name,
            slug: r.category_slug,
            image:
              r.category_image_storage_key != null
                ? {
                    mediaAssetId: r.category_image_media_id,
                    storageKey: r.category_image_storage_key,
                    contentType: r.category_image_content_type,
                    url: categoryImageUrl
                  }
                : null
          }
        : null,
    created_at: r.created_at,
    category_id: r.category_id
  };
}

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
    async listCategories(shopIdRaw, { parentId }) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const key = `shop:${shopId}:categories:${parentId ?? "root"}`;
      return cached(key, async () => {
        const rows = await catalogRepo.listCategoriesStorefront(shopId, { parentId });
        return rows.map(mapCategoryRow);
      });
    },

    async listProducts(
      shopIdRaw,
      { categoryId, brandId, search, limit, cursor, availability, minPriceMinor, maxPriceMinor, sortBy, sortOrder }
    ) {
      const shopId = requireShopId(shopIdRaw);
      await ensureShopForCatalog(shopId);
      const lim = Math.min(Math.max(Number(limit) || 24, 1), 100);
      const resolvedSortBy = sortBy || "created_at";
      const resolvedSortOrder = sortOrder || "desc";
      if (cursor && resolvedSortBy !== "created_at") {
        throw new ValidationError("cursor pagination is only supported with sort_by=created_at");
      }
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
      const key = `shop:${shopId}:products:v2:${categoryId ?? "all"}:${brandId ?? "all"}:${qPattern ?? "q"}:${availability ?? "any"}:${minPriceMinor ?? "min"}:${maxPriceMinor ?? "max"}:${resolvedSortBy}:${resolvedSortOrder}:${lim}:cur:${cursor ?? "none"}`;
      const items = await cached(key, async () => {
        const rows = await catalogRepo.listProductsStorefront(shopId, {
          categoryId: categoryId ?? null,
          brandId: brandId ?? null,
          qPattern,
          limit: lim + 1,
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
    }
  };
}
