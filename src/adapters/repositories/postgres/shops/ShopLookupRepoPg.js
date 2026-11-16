import { ShopLookupRepo } from "../../../../application/ports/repositories/ShopLookupRepo.js";
import { pool } from "../../../../infra/db/pool.js";

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

  #mapBrandingRow(row) {
    if (!row) return null;
    const bannerEnabled = row.banner_enabled !== false;
    const bannerStorageKeys = bannerEnabled
      ? (Array.isArray(row.banner_storage_keys) ? row.banner_storage_keys : []).map((key) =>
          String(key)
        )
      : [];
    return {
      id: row.id,
      name: row.name,
      domain: row.domain ?? null,
      custom_domain: row.custom_domain ?? null,
      seo_title: null,
      seo_description: null,
      seo_keywords: null,
      tagline: null,
      locale: null,
      theme_color: null,
      og_image_storage_key: null,
      og_image_alt: null,
      twitter_card: null,
      shop_image_storage_key: row.shop_image_storage_key ?? null,
      banner_enabled: bannerEnabled,
      banner_storage_keys: bannerStorageKeys
    };
  }

  /**
   * Shop row, logo, and banners in one statement.
   * Logo and banner predicates match the previous separate queries.
   * set_config runs in this statement so entity_images row security still sees the shop.
   */
  async #selectShopBranding(whereSql, params) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT s.id,
                s.name,
                s.domain,
                s.custom_domain,
                s.banner_enabled,
                logo.shop_image_storage_key,
                COALESCE(banners.storage_keys, ARRAY[]::text[]) AS banner_storage_keys
           FROM (
             SELECT ${ShopLookupRepoPg.#shopBrandingSelectColumns}
               FROM shops
              WHERE ${whereSql}
              LIMIT 1
           ) s
           CROSS JOIN LATERAL (
             SELECT set_config('app.current_shop_id', s.id::text, true) AS ctx
           ) cfg
           LEFT JOIN LATERAL (
             SELECT ma.storage_key AS shop_image_storage_key
               FROM entity_images ei
               JOIN media_assets ma ON ma.id = ei.media_asset_id
              WHERE cfg.ctx IS NOT NULL
                AND ei.shop_id = s.id
                AND ei.entity_type = 'shop'
              ORDER BY ei.updated_at DESC NULLS LAST, ei.created_at DESC
              LIMIT 1
           ) logo ON true
           LEFT JOIN LATERAL (
             SELECT array_agg(picked.storage_key ORDER BY picked.ord) AS storage_keys
               FROM (
                 SELECT ma.storage_key, ord.ord
                   FROM unnest(s.banner_media_asset_ids) WITH ORDINALITY AS ord(id, ord)
                   LEFT JOIN media_assets ma ON ma.id = ord.id
                  WHERE cfg.ctx IS NOT NULL
                    AND s.banner_enabled IS NOT FALSE
                    AND ma.storage_key IS NOT NULL
                    AND btrim(ma.storage_key) <> ''
               ) picked
           ) banners ON true`,
        params
      );
      return this.#mapBrandingRow(rows[0]);
    } finally {
      client.release();
    }
  }

  static #shopBrandingSelectColumns = `
    id, name, domain, custom_domain,
    banner_enabled, banner_media_asset_ids
  `;

  async findShopByDomain(domain) {
    const d = String(domain || "").trim().toLowerCase();
    if (!d) return null;
    return this.#selectShopBranding(
      `lower(domain) = lower($1)
          OR lower(custom_domain) = lower($1)`,
      [d]
    );
  }

  async findShopBrandingById(shopId) {
    const id = String(shopId || "").trim();
    if (!id) return null;
    return this.#selectShopBranding("id = $1::uuid", [id]);
  }

  async findShopIdByDomain(domain) {
    const row = await this.findShopByDomain(domain);
    return row?.id ?? null;
  }
}
