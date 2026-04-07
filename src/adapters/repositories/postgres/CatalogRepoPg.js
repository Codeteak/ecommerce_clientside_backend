import { CatalogRepo } from "../../../application/ports/repositories/CatalogRepo.js";
import { pool } from "../../../infra/db/pool.js";
import { setTenantContext } from "../../../infra/db/tenantContext.js";

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
        `SELECT id, shop_id, category_id, name, slug, base_unit, status, price_minor_per_unit::text AS price_minor_per_unit,
                created_at, updated_at
           FROM products
          WHERE status = 'active'
            AND ($1::uuid IS NULL OR category_id = $1)
          ORDER BY name ASC
          LIMIT 100`,
        [categoryId]
      );
      return rows;
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
        `SELECT id, shop_id, parent_id, name, slug, sort_order, is_active, metadata
           FROM categories
          WHERE is_active = true
            AND (
              ($1::uuid IS NULL AND parent_id IS NULL)
              OR ($1::uuid IS NOT NULL AND parent_id = $1)
            )
          ORDER BY sort_order ASC, name ASC
          LIMIT 500`,
        [parentId]
      );
      return rows;
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
        `SELECT id, shop_id, category_id, name, slug, base_unit, status, availability,
                price_minor_per_unit::text AS price_minor_per_unit,
                created_at, updated_at
           FROM products
          WHERE status = 'active'
            AND ($1::uuid IS NULL OR category_id = $1)
            AND ($2::text IS NULL OR availability = $2)
            AND (
              $3::text IS NULL
              OR name ILIKE $3 ESCAPE '\\'
              OR slug ILIKE $3 ESCAPE '\\'
            )
          ORDER BY ${orderBySql}
          LIMIT $4 OFFSET $5`,
        [categoryId, availability, qPattern, limit, offset]
      );
      return rows;
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
        `SELECT id, shop_id, parent_id, name, slug, sort_order, is_active, metadata
           FROM categories
          WHERE is_active = true
            AND (
              ($1::uuid IS NULL AND parent_id IS NULL)
              OR ($1::uuid IS NOT NULL AND parent_id = $1)
            )
            AND (
              $2::text IS NULL
              OR name ILIKE $2 ESCAPE '\\'
              OR slug ILIKE $2 ESCAPE '\\'
            )
          ORDER BY ${orderBySql}
          LIMIT $3 OFFSET $4`,
        [parentId, qPattern, limit, offset]
      );
      return rows;
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
           FROM categories c
           LEFT JOIN LATERAL (
             SELECT ei.media_asset_id
               FROM entity_images ei
              WHERE ei.shop_id = c.shop_id
                AND ei.entity_type = 'category'
                AND ei.entity_id = c.id
              ORDER BY ei.updated_at DESC NULLS LAST
              LIMIT 1
           ) img ON true
           LEFT JOIN media_assets ma ON ma.id = img.media_asset_id
          WHERE c.is_active = true
            AND c.shop_id = $1::uuid
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

  async listProductsStorefront(shopId, params) {
    const {
      categoryId,
      qPattern,
      limit,
      cursorCreatedAt,
      cursorId,
      availability
    } = params;
    const client = await pool.connect();
    try {
      await setTenantContext(client, shopId);
      const args = [shopId, categoryId, qPattern, availability, limit];
      let cursorClause = "";
      if (cursorCreatedAt && cursorId) {
        args.push(cursorCreatedAt, cursorId);
        cursorClause = `AND (p.created_at, p.id) < ($${args.length - 1}::timestamptz, $${args.length}::uuid)`;
      }
      const { rows } = await client.query(
        `SELECT p.id, p.category_id, p.name, p.slug, p.base_unit, p.status, p.availability,
                p.price_minor_per_unit::text AS price_minor_per_unit,
                p.created_at, p.updated_at,
                thumb.media_asset_id AS thumb_media_id,
                m.storage_key AS thumb_storage_key,
                m.content_type AS thumb_content_type
           FROM products p
           LEFT JOIN LATERAL (
             SELECT pi.media_asset_id
               FROM product_images pi
              WHERE pi.product_id = p.id AND pi.shop_id = p.shop_id
              ORDER BY pi.sort_order ASC
              LIMIT 1
           ) thumb ON true
           LEFT JOIN media_assets m ON m.id = thumb.media_asset_id
          WHERE p.shop_id = $1::uuid
            AND p.status = 'active'
            AND ($2::uuid IS NULL OR p.category_id = $2)
            AND ($3::text IS NULL OR p.name ILIKE $3 ESCAPE '\\' OR p.slug ILIKE $3 ESCAPE '\\')
            AND ($4::text IS NULL OR p.availability = $4)
            ${cursorClause}
          ORDER BY p.created_at DESC, p.id DESC
          LIMIT $5`,
        args
      );
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
        `SELECT id, shop_id, category_id, name, slug, base_unit, status, availability,
                price_minor_per_unit::text AS price_minor_per_unit,
                created_at, updated_at
           FROM products
          WHERE shop_id = $1::uuid
            AND lower(slug) = $2
            AND status = 'active'
          LIMIT 1`,
        [shopId, norm]
      );
      const product = prodRows[0];
      if (!product) return null;

      const { rows: galRows } = await client.query(
        `SELECT pi.media_asset_id, pi.sort_order,
                m.storage_key, m.content_type
           FROM product_images pi
           JOIN media_assets m ON m.id = pi.media_asset_id
          WHERE pi.product_id = $1::uuid AND pi.shop_id = $2::uuid
          ORDER BY pi.sort_order ASC
          LIMIT 6`,
        [product.id, shopId]
      );

      let gallery = galRows;
      if (gallery.length === 0) {
        const { rows: fb } = await client.query(
          `SELECT unnest(app.find_fallback_product_gallery_ids_by_slug($1)) AS media_asset_id`,
          [slug]
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
}

