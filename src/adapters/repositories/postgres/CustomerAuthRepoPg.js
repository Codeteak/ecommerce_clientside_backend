import { CustomerAuthRepo } from "../../../application/ports/repositories/CustomerAuthRepo.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { pool } from "../../../infra/db/pool.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";

/**
 * Purpose: This file is the PostgreSQL implementation of customer auth data access.
 * It handles user/customer lookup, membership checks, profile updates, and
 * account creation queries used by authentication and profile services.
 */
function registrationSourceFromUserRow(row) {
  if (!row) return "password";
  return row.password_hash == null ? "google" : "password";
}

function withRegistrationSource(row) {
  if (!row) return null;
  return { ...row, registration_source: registrationSourceFromUserRow(row) };
}

const ADDRESS_API_TO_DB = {
  line1: "line1",
  line2: "line2",
  landmark: "landmark",
  city: "city",
  state: "state",
  postalCode: "postal_code",
  country: "country",
  lat: "lat",
  lng: "lng",
  raw: "raw"
};

export class CustomerAuthRepoPg extends CustomerAuthRepo {
  async getShopById(client, shopId) {
    const { rows } = await client.query(
      `SELECT id, slug, name, is_active, status, is_blocked, is_deleted
         FROM shops
        WHERE id = $1`,
      [shopId]
    );
    return rows[0] ?? null;
  }

  async isCustomerSessionValid(userId, customerId) {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT 1
           FROM users u
           JOIN customers c ON c.user_id = u.id
          WHERE u.id = $1
            AND c.id = $2
            AND u.is_active = true
            AND c.is_blocked = false
            AND c.is_deleted = false
          LIMIT 1`,
        [userId, customerId]
      );
      return rows.length > 0;
    } finally {
      client.release();
    }
  }

  async getUserById(client, userId) {
    const { rows } = await client.query(
      `SELECT id, email, phone, password_hash, is_active
         FROM users
        WHERE id = $1`,
      [userId]
    );
    return withRegistrationSource(rows[0]);
  }

  async getUserByEmail(client, email) {
    const { rows } = await client.query(
      `SELECT id, email, phone, password_hash, is_active
         FROM users
        WHERE lower(email) = lower($1)`,
      [email]
    );
    return withRegistrationSource(rows[0]);
  }

  async getCustomerByUserId(client, userId) {
    const { rows } = await client.query(
      `SELECT id, user_id, display_name, is_blocked, is_deleted
         FROM customers
        WHERE user_id = $1`,
      [userId]
    );
    return rows[0] ?? null;
  }

  async getMembershipByCustomerAndShop(client, customerId, shopId) {
    const { rows } = await client.query(
      `SELECT id, shop_id, customer_id, is_active, is_blocked, is_deleted
         FROM customer_shop_memberships
        WHERE customer_id = $1 AND shop_id = $2`,
      [customerId, shopId]
    );
    return rows[0] ?? null;
  }

  async listShopIdsForCustomer(client, customerId) {
    const { rows } = await client.query(
      `SELECT s.id
         FROM customer_shop_memberships m
         JOIN shops s ON s.id = m.shop_id
        WHERE m.customer_id = $1
          AND m.is_active = true
          AND m.is_blocked = false
          AND m.is_deleted = false
        ORDER BY s.id ASC`,
      [customerId]
    );
    return rows.map((r) => r.id);
  }

  async listActiveShopsForCustomer(client, customerId) {
    const { rows } = await client.query(
      `SELECT s.id, s.name, s.slug
         FROM customer_shop_memberships m
         JOIN shops s ON s.id = m.shop_id
        WHERE m.customer_id = $1
          AND m.is_active = true
          AND m.is_blocked = false
          AND m.is_deleted = false
        ORDER BY s.id ASC`,
      [customerId]
    );
    return rows;
  }

  async getCustomerProfileByCustomerId(client, customerId) {
    const { rows } = await client.query(
      `SELECT c.id, c.user_id, c.display_name, c.is_blocked, c.is_deleted,
              a.id AS a_id, a.line1, a.line2, a.landmark, a.city, a.state,
              a.postal_code, a.country, a.lat, a.lng, a.raw
         FROM customers c
         LEFT JOIN addresses a ON a.id = c.address_id
        WHERE c.id = $1`,
      [customerId]
    );
    const r = rows[0];
    if (!r) return null;

    const address = r.a_id
      ? {
          line1: r.line1,
          line2: r.line2,
          landmark: r.landmark,
          city: r.city,
          state: r.state,
          postalCode: r.postal_code,
          country: r.country,
          lat: r.lat,
          lng: r.lng,
          raw: r.raw
        }
      : null;

    return {
      id: r.id,
      user_id: r.user_id,
      display_name: r.display_name,
      is_blocked: r.is_blocked,
      is_deleted: r.is_deleted,
      address
    };
  }

  async patchCustomerProfile(client, { customerId, userId, displayName, addressPatch }) {
    const custRes = await client.query(
      `SELECT id, address_id, display_name, is_blocked, is_deleted
         FROM customers
        WHERE id = $1 AND user_id = $2
        FOR UPDATE`,
      [customerId, userId]
    );
    const c = custRes.rows[0];
    if (!c) {
      throw new NotFoundError("Profile not found");
    }

    if (displayName !== undefined) {
      await client.query(
        `UPDATE customers SET display_name = $1, updated_at = now() WHERE id = $2`,
        [displayName, customerId]
      );
    }

    if (!addressPatch || Object.keys(addressPatch).length === 0) {
      return;
    }

    let addrId = c.address_id;
    let current = {
      line1: null,
      line2: null,
      landmark: null,
      city: null,
      state: null,
      postal_code: null,
      country: null,
      lat: null,
      lng: null,
      raw: null
    };

    if (addrId) {
      const ar = await client.query(
        `SELECT line1, line2, landmark, city, state, postal_code, country, lat, lng, raw
           FROM addresses
          WHERE id = $1
          FOR UPDATE`,
        [addrId]
      );
      const a = ar.rows[0];
      if (a) {
        current = {
          line1: a.line1,
          line2: a.line2,
          landmark: a.landmark,
          city: a.city,
          state: a.state,
          postal_code: a.postal_code,
          country: a.country,
          lat: a.lat,
          lng: a.lng,
          raw: a.raw
        };
      }
    }

    const merged = { ...current };
    for (const [apiKey, val] of Object.entries(addressPatch)) {
      const col = ADDRESS_API_TO_DB[apiKey];
      if (!col) continue;
      merged[col] = val;
    }

    const lat = merged.lat;
    const lng = merged.lng;
    if ((lat == null) !== (lng == null)) {
      throw new ValidationError("lat and lng must both be set or both null");
    }
    if (lat != null && (lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
      throw new ValidationError("Invalid coordinates");
    }

    if (!addrId) {
      const ins = await client.query(
        `INSERT INTO addresses (
           line1, line2, landmark, city, state, postal_code, country, lat, lng, raw
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          merged.line1,
          merged.line2,
          merged.landmark,
          merged.city,
          merged.state,
          merged.postal_code,
          merged.country,
          merged.lat,
          merged.lng,
          merged.raw
        ]
      );
      addrId = ins.rows[0].id;
      await client.query(
        `UPDATE customers SET address_id = $1, updated_at = now() WHERE id = $2`,
        [addrId, customerId]
      );
    } else {
      await client.query(
        `UPDATE addresses
            SET line1 = $1,
                line2 = $2,
                landmark = $3,
                city = $4,
                state = $5,
                postal_code = $6,
                country = $7,
                lat = $8,
                lng = $9,
                raw = $10,
                updated_at = now()
          WHERE id = $11`,
        [
          merged.line1,
          merged.line2,
          merged.landmark,
          merged.city,
          merged.state,
          merged.postal_code,
          merged.country,
          merged.lat,
          merged.lng,
          merged.raw,
          addrId
        ]
      );
    }
  }

  async insertUser(client, { email, password_hash }) {
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, password_hash`,
      [email, password_hash]
    );
    return withRegistrationSource(rows[0]);
  }

  async insertCustomer(client, { user_id, display_name }) {
    const { rows } = await client.query(
      `INSERT INTO customers (user_id, display_name)
       VALUES ($1, $2)
       RETURNING id`,
      [user_id, display_name]
    );
    return rows[0];
  }

  async insertMembership(client, { shop_id, customer_id }) {
    const { rows } = await client.query(
      `INSERT INTO customer_shop_memberships (shop_id, customer_id, is_active)
       VALUES ($1, $2, true)
       RETURNING id`,
      [shop_id, customer_id]
    );
    return rows[0];
  }

  async reactivateMembership(client, membershipId) {
    await client.query(
      `UPDATE customer_shop_memberships
          SET is_active = true,
              is_blocked = false,
              is_deleted = false,
              updated_at = now()
        WHERE id = $1`,
      [membershipId]
    );
  }

  async updateUserPhone(client, userId, phone) {
    await client.query(`UPDATE users SET phone = $2 WHERE id = $1`, [userId, phone]);
  }
}
