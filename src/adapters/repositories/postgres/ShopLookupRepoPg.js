import { ShopLookupRepo } from "../../../application/ports/repositories/ShopLookupRepo.js";
import { pool } from "../../../infra/db/pool.js";

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
}
