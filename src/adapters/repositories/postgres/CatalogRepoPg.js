import { CatalogRepo } from "../../../application/ports/repositories/CatalogRepo.js";
import { pool } from "../../../infra/db/pool.js";
import { setTenantContext } from "../../../infra/db/tenantContext.js";

export class CatalogRepoPg extends CatalogRepo {
  /**
   * @param {string} shopId
   * @param {{ categoryId?: string|null }} filters
   */
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

  /**
   * @param {string} shopId
   * @param {{ parentId?: string|null }} filters
   */
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
}
