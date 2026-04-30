import { CatalogRepo } from "../../../application/ports/repositories/CatalogRepo.js";
import { pool } from "../../../infra/db/pool.js";
import { setTenantContext } from "../../../infra/db/tenantContext.js";
import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";
import { storefrontProductsOrderByClause } from "../../../application/services/catalog/catalogSearchOrder.js";
import { buildListProductsStorefrontQuery } from "./queries/buildListProductsStorefrontQuery.js";

/**
 * Purpose: This file is the PostgreSQL implementation of catalog data access.
 * It reads storefront and admin catalog data (products, categories, images)
 * using tenant-aware SQL queries scoped to one shop.
 */
export class CatalogRepoPg extends CatalogRepo {
  async listProducts(shopId, filters = {}) {
    const categoryId = filters.categoryId ?? null;
    const client = await pool.connect();
    try {
      await setTenantContext(client, shopId);
      const { rows } = await client.query(
        `SELECT sp.id, sp.shop_id, gp.global_category_id AS category_id, gp.name, gp.slug, gp.base_unit, sp.status,
                sp.price_minor_per_unit::text AS price_minor_per_unit,
                sp.created_at, sp.updated_at,
                pm.id AS image_media_id,
                pm.storage_key AS image_storage_key,
                pm.content_type AS image_content_type,
                c.parent_id AS category_parent_id,
                c.name AS category_name,
                c.slug AS category_slug,
                cm.id AS category_image_media_id,
                cm.storage_key AS category_image_storage_key,
                cm.content_type AS category_image_content_type
           FROM shop_products sp
           JOIN global_products gp ON gp.id = sp.global_product_id
           LEFT JOIN LATERAL (
             WITH chosen_images AS (
               SELECT spi.media_asset_id, spi.sort_order
                 FROM shop_product_images spi
                WHERE spi.shop_product_id = sp.id
               UNION ALL
               SELECT gpi.media_asset_id, gpi.sort_order
                 FROM global_product_images gpi
                WHERE gpi.global_product_id = sp.global_product_id
                  AND NOT EXISTS (
                    SELECT 1 FROM shop_product_images spi2 WHERE spi2.shop_product_id = sp.id
                  )
             )
             SELECT ci.media_asset_id
               FROM chosen_images ci
              ORDER BY ci.sort_order ASC
              LIMIT 1
           ) pimg ON true
           LEFT JOIN media_assets pm ON pm.id = pimg.media_asset_id
           LEFT JOIN global_categories c ON c.id = gp.global_category_id
           LEFT JOIN LATERAL (
             SELECT ei.media_asset_id
               FROM entity_images ei
              WHERE ei.shop_id = sp.shop_id
                AND ei.entity_type = 'category'
                AND ei.entity_id = c.id
              ORDER BY ei.updated_at DESC NULLS LAST
              LIMIT 1
           ) cimg ON true
           LEFT JOIN media_assets cm ON cm.id = cimg.media_asset_id
          WHERE sp.shop_id = $1::uuid
            AND sp.status = 'active'
            AND ($2::uuid IS NULL OR gp.global_category_id = $2)
          ORDER BY gp.name ASC
          LIMIT 100`,
        [shopId, categoryId]
      );
      return rows.map((r) => ({
        ...r,
        image:
          r.image_storage_key != null
            ? {
                mediaAssetId: r.image_media_id,
                storageKey: r.image_storage_key,
                contentType: r.image_content_type,
                url: toPublicMediaUrl(r.image_storage_key)
              }
            : null,
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
                        url: toPublicMediaUrl(r.category_image_storage_key)
                      }
                    : null
              }
            : null
      }));
    } finally {
      client.release();
    }
  }

  async listCategories(shopId, filters = {}) {
    const parentId = filters.parentId !== undefined ? filters.parentId : null;
    const client = await pool.connect();
    try {
      await setTenantContext(client, shopId);
      const { rows } = await client.query(
        `SELECT c.id, $1::uuid AS shop_id, c.parent_id, c.name, c.slug, c.sort_order, c.is_active,
                ma.id AS image_media_id,
                ma.storage_key AS image_storage_key,
                ma.content_type AS image_content_type
           FROM global_categories c
           LEFT JOIN LATERAL (
             SELECT ei.media_asset_id
               FROM entity_images ei
              WHERE ei.shop_id = $1::uuid
                AND ei.entity_type = 'category'
                AND ei.entity_id = c.id
              ORDER BY ei.updated_at DESC NULLS LAST
              LIMIT 1
           ) img ON true
           LEFT JOIN media_assets ma ON ma.id = img.media_asset_id
          WHERE c.is_active = true
            AND (
              c.scope = 'shared'
              OR (c.scope = 'private' AND c.owner_shop_id = $1::uuid)
            )
            AND (
              ($2::uuid IS NULL AND c.parent_id IS NULL)
              OR ($2::uuid IS NOT NULL AND c.parent_id = $2)
            )
          ORDER BY c.sort_order ASC, c.name ASC
          LIMIT 500`,
        [shopId, parentId]
      );
      return rows.map((r) => ({
        id: r.id,
        shop_id: r.shop_id,
        parent_id: r.parent_id,
        name: r.name,
        slug: r.slug,
        sort_order: r.sort_order,
        is_active: r.is_active,
        image:
          r.image_storage_key != null
            ? {
                mediaAssetId: r.image_media_id,
                storageKey: r.image_storage_key,
                contentType: r.image_content_type,
                url: toPublicMediaUrl(r.image_storage_key)
              }
            : null
      }));
    } finally {
      client.release();
    }
  }

  async searchProducts(shopId, params) {
    const {
      categoryId,
      availability,
      qPattern,
      orderBySql,
      limit,
      offset
    } = params;
    const client = await pool.connect();
    try {
      await setTenantContext(client, shopId);
      const { rows } = await client.query(
        `SELECT sp.id, sp.shop_id, gp.global_category_id AS category_id, gp.name, gp.slug, gp.base_unit, sp.status, sp.availability,
                sp.price_minor_per_unit::text AS price_minor_per_unit,
                sp.created_at, sp.updated_at,
                pm.id AS image_media_id,
                pm.storage_key AS image_storage_key,
                pm.content_type AS image_content_type,
                c.parent_id AS category_parent_id,
                c.name AS category_name,
                c.slug AS category_slug,
                cm.id AS category_image_media_id,
                cm.storage_key AS category_image_storage_key,
                cm.content_type AS category_image_content_type
           FROM shop_products sp
           JOIN global_products gp ON gp.id = sp.global_product_id
           LEFT JOIN LATERAL (
             WITH chosen_images AS (
               SELECT spi.media_asset_id, spi.sort_order
                 FROM shop_product_images spi
                WHERE spi.shop_product_id = sp.id
               UNION ALL
               SELECT gpi.media_asset_id, gpi.sort_order
                 FROM global_product_images gpi
                WHERE gpi.global_product_id = sp.global_product_id
                  AND NOT EXISTS (
                    SELECT 1 FROM shop_product_images spi2 WHERE spi2.shop_product_id = sp.id
                  )
             )
             SELECT ci.media_asset_id
               FROM chosen_images ci
              ORDER BY ci.sort_order ASC
              LIMIT 1
           ) pimg ON true
           LEFT JOIN media_assets pm ON pm.id = pimg.media_asset_id
           LEFT JOIN global_categories c ON c.id = gp.global_category_id
           LEFT JOIN LATERAL (
             SELECT ei.media_asset_id
               FROM entity_images ei
              WHERE ei.shop_id = sp.shop_id
                AND ei.entity_type = 'category'
                AND ei.entity_id = c.id
              ORDER BY ei.updated_at DESC NULLS LAST
              LIMIT 1
           ) cimg ON true
           LEFT JOIN media_assets cm ON cm.id = cimg.media_asset_id
          WHERE sp.shop_id = $1::uuid
            AND sp.status = 'active'
            AND ($2::uuid IS NULL OR gp.global_category_id = $2)
            AND ($3::text IS NULL OR sp.availability = $3)
            AND (
              $4::text IS NULL
              OR gp.name ILIKE $4 ESCAPE '\\'
              OR gp.slug ILIKE $4 ESCAPE '\\'
            )
          ORDER BY ${orderBySql}
          LIMIT $5 OFFSET $6`,
        [shopId, categoryId, availability, qPattern, limit, offset]
      );
      return rows.map((r) => ({
        ...r,
        image:
          r.image_storage_key != null
            ? {
                mediaAssetId: r.image_media_id,
                storageKey: r.image_storage_key,
                contentType: r.image_content_type,
                url: toPublicMediaUrl(r.image_storage_key)
              }
            : null,
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
                        url: toPublicMediaUrl(r.category_image_storage_key)
                      }
                    : null
              }
            : null
      }));
    } finally {
      client.release();
    }
  }

  async searchCategories(shopId, params) {
    const { parentId, qPattern, orderBySql, limit, offset } = params;
    const client = await pool.connect();
    try {
      await setTenantContext(client, shopId);
      const { rows } = await client.query(
        `SELECT c.id, $1::uuid AS shop_id, c.parent_id, c.name, c.slug, c.sort_order, c.is_active,
                ma.id AS image_media_id,
                ma.storage_key AS image_storage_key,
                ma.content_type AS image_content_type
           FROM global_categories c
           LEFT JOIN LATERAL (
             SELECT ei.media_asset_id
               FROM entity_images ei
              WHERE ei.shop_id = $1::uuid
                AND ei.entity_type = 'category'
                AND ei.entity_id = c.id
              ORDER BY ei.updated_at DESC NULLS LAST
              LIMIT 1
           ) img ON true
           LEFT JOIN media_assets ma ON ma.id = img.media_asset_id
          WHERE c.is_active = true
            AND (
              c.scope = 'shared'
              OR (c.scope = 'private' AND c.owner_shop_id = $1::uuid)
            )
            AND (
              ($2::uuid IS NULL AND c.parent_id IS NULL)
              OR ($2::uuid IS NOT NULL AND c.parent_id = $2)
            )
            AND (
              $3::text IS NULL
              OR c.name ILIKE $3 ESCAPE '\\'
              OR c.slug ILIKE $3 ESCAPE '\\'
            )
          ORDER BY ${orderBySql}
          LIMIT $4 OFFSET $5`,
        [shopId, parentId, qPattern, limit, offset]
      );
      return rows.map((r) => ({
        id: r.id,
        shop_id: r.shop_id,
        parent_id: r.parent_id,
        name: r.name,
        slug: r.slug,
        sort_order: r.sort_order,
        is_active: r.is_active,
        image:
          r.image_storage_key != null
            ? {
                mediaAssetId: r.image_media_id,
                storageKey: r.image_storage_key,
                contentType: r.image_content_type,
                url: toPublicMediaUrl(r.image_storage_key)
              }
            : null
      }));
    } finally {
      client.release();
    }
  }

  async listCategoriesStorefront(shopId, filters = {}) {
    const parentId = filters.parentId !== undefined ? filters.parentId : null;
    const client = await pool.connect();
    try {
      await setTenantContext(client, shopId);
      const { rows } = await client.query(
        `SELECT c.id, c.parent_id, c.name, c.slug, c.sort_order,
                ma.id AS image_media_id,
                ma.storage_key AS image_storage_key,
                ma.content_type AS image_content_type
           FROM global_categories c
           LEFT JOIN LATERAL (
             SELECT ei.media_asset_id
               FROM entity_images ei
              WHERE ei.shop_id = $1::uuid
                AND ei.entity_type = 'category'
                AND ei.entity_id = c.id
              ORDER BY ei.updated_at DESC NULLS LAST
              LIMIT 1
           ) img ON true
           LEFT JOIN media_assets ma ON ma.id = img.media_asset_id
          WHERE c.is_active = true
            AND (
              c.scope = 'shared'
              OR (c.scope = 'private' AND c.owner_shop_id = $1::uuid)
            )
            AND (
              ($2::uuid IS NULL AND c.parent_id IS NULL)
              OR ($2::uuid IS NOT NULL AND c.parent_id = $2)
            )
          ORDER BY c.sort_order ASC, c.name ASC
          LIMIT 500`,
        [shopId, parentId]
      );
      return rows;
    } finally {
      client.release();
    }
  }

  async listAllCategoriesStorefront(shopId) {
    const client = await pool.connect();
    try {
      await setTenantContext(client, shopId);
      const { rows } = await client.query(
        `SELECT c.id, c.parent_id, c.name, c.slug, c.sort_order,
                ma.id AS image_media_id,
                ma.storage_key AS image_storage_key,
                ma.content_type AS image_content_type
           FROM global_categories c
           LEFT JOIN LATERAL (
             SELECT ei.media_asset_id
               FROM entity_images ei
              WHERE ei.shop_id = $1::uuid
                AND ei.entity_type = 'category'
                AND ei.entity_id = c.id
              ORDER BY ei.updated_at DESC NULLS LAST
              LIMIT 1
           ) img ON true
           LEFT JOIN media_assets ma ON ma.id = img.media_asset_id
          WHERE c.is_active = true
            AND (
              c.scope = 'shared'
              OR (c.scope = 'private' AND c.owner_shop_id = $1::uuid)
            )
          ORDER BY c.sort_order ASC, c.name ASC
          LIMIT 5000`,
        [shopId]
      );
      return rows;
    } finally {
      client.release();
    }
  }

  async listProductsStorefront(shopId, params) {
    const {
      categoryId,
      brandId,
      qPattern,
      limit,
      offset,
      cursorCreatedAt,
      cursorId,
      availability,
      minPriceMinor,
      maxPriceMinor,
      sortBy,
      sortOrder
    } = params;
    const client = await pool.connect();
    try {
      await setTenantContext(client, shopId);
      const orderBySql = storefrontProductsOrderByClause(sortBy, sortOrder);
      const query = buildListProductsStorefrontQuery({
        shopId,
        categoryId,
        brandId,
        qPattern,
        availability,
        minPriceMinor,
        maxPriceMinor,
        limit,
        offset,
        cursorCreatedAt,
        cursorId,
        sortOrder,
        orderBySql
      });
      const { rows } = await client.query(query);
      return rows;
    } finally {
      client.release();
    }
  }

  async getProductBySlugStorefront(shopId, slug) {
    const norm = String(slug || "").trim().toLowerCase();
    const client = await pool.connect();
    try {
      await setTenantContext(client, shopId);
      const { rows: prodRows } = await client.query(
        `SELECT sp.id, sp.shop_id, gp.global_category_id AS category_id,
                gp.name, gp.slug, gp.base_unit, sp.status, sp.availability,
                sp.price_minor_per_unit::text AS price_minor_per_unit,
                sp.offer_price_minor_per_unit::text AS offer_price_minor_per_unit,
                sp.created_at, sp.updated_at, sp.global_product_id
           FROM shop_products sp
           JOIN global_products gp ON gp.id = sp.global_product_id
          WHERE sp.shop_id = $1::uuid
            AND lower(gp.slug) = $2
            AND sp.status = 'active'
          LIMIT 1`,
        [shopId, norm]
      );
      const product = prodRows[0];
      if (!product) return null;

      const { rows: galRows } = await client.query(
        `SELECT spi.media_asset_id, spi.sort_order,
                m.storage_key, m.content_type
           FROM shop_product_images spi
           JOIN media_assets m ON m.id = spi.media_asset_id
          WHERE spi.shop_product_id = $1::uuid
          ORDER BY spi.sort_order ASC
          LIMIT 6`,
        [product.id]
      );

      let gallery = galRows;
      if (gallery.length === 0) {
        const { rows: fb } = await client.query(
          `SELECT unnest(app.find_fallback_product_gallery_ids_by_slug_and_shop($1::uuid, $2::text)) AS media_asset_id`,
          [shopId, slug]
        );
        const ids = fb.map((r) => r.media_asset_id).filter(Boolean);
        if (ids.length > 0) {
          const { rows: assets } = await client.query(
            `SELECT id AS media_asset_id, storage_key, content_type
               FROM media_assets
              WHERE id = ANY($1::uuid[])
              ORDER BY array_position($1::uuid[], id)`,
            [ids]
          );
          gallery = assets.map((a, i) => ({
            media_asset_id: a.media_asset_id,
            sort_order: i,
            storage_key: a.storage_key,
            content_type: a.content_type
          }));
        }
      }

      return { product, gallery };
    } finally {
      client.release();
    }
  }

  async getProductByIdStorefront(shopId, id) {
    const client = await pool.connect();
    try {
      await setTenantContext(client, shopId);
      const { rows: prodRows } = await client.query(
        `SELECT sp.id, sp.shop_id, gp.global_category_id AS category_id,
                gp.name, gp.slug, gp.base_unit, sp.status, sp.availability,
                sp.price_minor_per_unit::text AS price_minor_per_unit,
                sp.offer_price_minor_per_unit::text AS offer_price_minor_per_unit,
                sp.created_at, sp.updated_at, sp.global_product_id
           FROM shop_products sp
           JOIN global_products gp ON gp.id = sp.global_product_id
          WHERE sp.shop_id = $1::uuid
            AND sp.id = $2::uuid
            AND sp.status = 'active'
          LIMIT 1`,
        [shopId, id]
      );
      const product = prodRows[0];
      if (!product) return null;

      const { rows: galRows } = await client.query(
        `SELECT spi.media_asset_id, spi.sort_order,
                m.storage_key, m.content_type
           FROM shop_product_images spi
           JOIN media_assets m ON m.id = spi.media_asset_id
          WHERE spi.shop_product_id = $1::uuid
          ORDER BY spi.sort_order ASC
          LIMIT 6`,
        [product.id]
      );

      let gallery = galRows;
      if (gallery.length === 0) {
        const { rows: fallbackRows } = await client.query(
          `SELECT gpi.media_asset_id, gpi.sort_order,
                  m.storage_key, m.content_type
             FROM global_product_images gpi
             JOIN media_assets m ON m.id = gpi.media_asset_id
            WHERE gpi.global_product_id = $1::uuid
            ORDER BY gpi.sort_order ASC
            LIMIT 6`,
          [product.global_product_id]
        );
        gallery = fallbackRows;
      }

      return { product, gallery };
    } finally {
      client.release();
    }
  }

  async getCategoryBySlugStorefront(shopId, slug) {
    const norm = String(slug || "").trim().toLowerCase();
    const client = await pool.connect();
    try {
      await setTenantContext(client, shopId);
      const { rows } = await client.query(
        `SELECT c.id, c.parent_id, c.name, c.slug, c.sort_order,
                ma.id AS image_media_id,
                ma.storage_key AS image_storage_key,
                ma.content_type AS image_content_type
           FROM global_categories c
           LEFT JOIN LATERAL (
             SELECT ei.media_asset_id
               FROM entity_images ei
              WHERE ei.shop_id = $1::uuid
                AND ei.entity_type = 'category'
                AND ei.entity_id = c.id
              ORDER BY ei.updated_at DESC NULLS LAST
              LIMIT 1
           ) img ON true
           LEFT JOIN media_assets ma ON ma.id = img.media_asset_id
          WHERE c.is_active = true
            AND (
              c.scope = 'shared'
              OR (c.scope = 'private' AND c.owner_shop_id = $1::uuid)
            )
            AND lower(c.slug) = $2
          LIMIT 1`,
        [shopId, norm]
      );
      return rows[0] ?? null;
    } finally {
      client.release();
    }
  }
}

