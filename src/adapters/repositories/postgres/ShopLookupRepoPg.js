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

  async #loadBannerStorageKeys(client, assetIds) {
    const ids = Array.isArray(assetIds) ? assetIds.filter(Boolean) : [];
    if (!ids.length) return [];
    const { rows } = await client.query(
      `SELECT ma.storage_key
         FROM unnest($1::uuid[]) WITH ORDINALITY AS ord(id, ord)
         LEFT JOIN media_assets ma ON ma.id = ord.id
        WHERE ma.storage_key IS NOT NULL
          AND btrim(ma.storage_key) <> ''
        ORDER BY ord.ord`,
      [ids]
    );
    return rows.map((r) => String(r.storage_key));
  }

  async #loadShopBrandingRow(client, shopRow) {
    if (!shopRow) return null;
    await setTenantContext(client, shopRow.id);
    const { rows: imageRows } = await client.query(
      `SELECT ma.storage_key AS shop_image_storage_key
         FROM entity_images ei
         JOIN media_assets ma ON ma.id = ei.media_asset_id
        WHERE ei.shop_id = $1
          AND ei.entity_type = 'shop'
        ORDER BY ei.updated_at DESC NULLS LAST, ei.created_at DESC
        LIMIT 1`,
      [shopRow.id]
    );
    const bannerEnabled = shopRow.banner_enabled !== false;
    const bannerStorageKeys = bannerEnabled
      ? await this.#loadBannerStorageKeys(client, shopRow.banner_media_asset_ids)
      : [];
    return {
      id: shopRow.id,
      name: shopRow.name,
      shop_image_storage_key: imageRows[0]?.shop_image_storage_key ?? null,
      banner_enabled: bannerEnabled,
      banner_storage_keys: bannerStorageKeys
    };
  }

  async findShopByDomain(domain) {
    const d = String(domain || "").trim().toLowerCase();
    if (!d) return null;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT id, name, banner_enabled, banner_media_asset_ids
           FROM shops
          WHERE lower(domain) = lower($1)
             OR lower(custom_domain) = lower($1)
          LIMIT 1`,
        [d]
      );
      return this.#loadShopBrandingRow(client, rows[0]);
    } finally {
      client.release();
    }
  }

  async findShopBrandingById(shopId) {
    const id = String(shopId || "").trim();
    if (!id) return null;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT id, name, banner_enabled, banner_media_asset_ids
           FROM shops
          WHERE id = $1::uuid
          LIMIT 1`,
        [id]
      );
      return this.#loadShopBrandingRow(client, rows[0]);
    } finally {
      client.release();
    }
  }

  async findShopIdByDomain(domain) {
    const row = await this.findShopByDomain(domain);
    return row?.id ?? null;
  }
}
