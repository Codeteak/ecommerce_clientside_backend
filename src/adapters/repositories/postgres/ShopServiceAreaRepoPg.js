import { pool } from "../../../infra/db/pool.js";
import { ShopServiceAreaRepo } from "../../../application/ports/repositories/ShopServiceAreaRepo.js";

export class ShopServiceAreaRepoPg extends ShopServiceAreaRepo {
  /** @param {string} shopId */
  async getShopHubForServiceCheck(shopId) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT s.id,
                s.status,
                s.is_active,
                s.is_blocked,
                s.is_deleted,
                s.service_area_radius_meters,
                a.lat AS hub_lat,
                a.lng AS hub_lng
           FROM shops s
           LEFT JOIN addresses a ON a.id = s.address_id
          WHERE s.id = $1`,
        [shopId]
      );
      return rows[0] ?? null;
    } finally {
      client.release();
    }
  }
}
