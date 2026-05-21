import { ShopLookupRepo } from "../../../application/ports/repositories/ShopLookupRepo.js";
import { pool } from "../../../infra/db/pool.js";
import { setTenantContext } from "../../../infra/db/tenantContext.js";

// Purpose: This file gets shop IDs from PostgreSQL using slug or custom domain.
export class ShopLookupRepoPg extends ShopLookupRepo {
  async findShopIdBySlug(slug) {
    const s = String(slug || "").trim().toLowerCase();
    if (!s) return null;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(`SELECT id FROM shops WHERE lower(slug) = lower($1) LIMIT 1`, [s]);
      return rows[0]?.id ?? null;
    } finally {
      client.release();
    }
  }

  async findShopIdByCustomDomain(hostLower) {
    const h = String(hostLower || "").trim().toLowerCase();
    if (!h) return null;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT id FROM shops WHERE lower(custom_domain) = lower($1) LIMIT 1`,
        [h]
      );
      return rows[0]?.id ?? null;
    } finally {
      client.release();
    }
  }

  async findShopByDomain(domain) {
    const d = String(domain || "").trim().toLowerCase();
    if (!d) return null;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT id, name
           FROM shops
          WHERE lower(domain) = lower($1)
             OR lower(custom_domain) = lower($1)
          LIMIT 1`,
        [d]
      );
      const shop = rows[0];
      if (!shop) return null;

      await setTenantContext(client, shop.id);
      const { rows: imageRows } = await client.query(
        `SELECT ma.storage_key AS shop_image_storage_key
           FROM entity_images ei
           JOIN media_assets ma ON ma.id = ei.media_asset_id
          WHERE ei.shop_id = $1
            AND ei.entity_type = 'shop'
          ORDER BY ei.updated_at DESC NULLS LAST, ei.created_at DESC
          LIMIT 1`,
        [shop.id]
      );

      return {
        id: shop.id,
        name: shop.name,
        shop_image_storage_key: imageRows[0]?.shop_image_storage_key ?? null
      };
    } finally {
      client.release();
    }
  }

  async findShopIdByDomain(domain) {
    const row = await this.findShopByDomain(domain);
    return row?.id ?? null;
  }
}
