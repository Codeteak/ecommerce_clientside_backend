import { CatalogRepo } from "../../../application/ports/repositories/CatalogRepo.js";
import { pool } from "../../../infra/db/pool.js";
import { setTenantContext } from "../../../infra/db/tenantContext.js";

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
      // orderBySql: whitelist-only (catalogSearchOrder.js)
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
}
