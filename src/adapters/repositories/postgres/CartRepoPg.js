import { CartRepo } from "../../../application/ports/repositories/CartRepo.js";
import { setTenantContext } from "../../../infra/db/tenantContext.js";

/**
 * Purpose: This file is the PostgreSQL implementation of cart data access.
 * It performs tenant-scoped cart queries and writes for creating carts,
 * managing cart items, and merging guest carts into customer carts.
 */
export class CartRepoPg extends CartRepo {
  async findCartByShopAndCustomerId(client, shopId, customerIdText) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT id, shop_id, customer_id, created_at FROM carts WHERE shop_id = $1::uuid AND customer_id = $2 LIMIT 1`,
      [shopId, customerIdText]
    );
    return rows[0] ?? null;
  }

  async insertCart(client, shopId, customerIdText) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `INSERT INTO carts (shop_id, customer_id) VALUES ($1::uuid, $2) RETURNING id, shop_id, customer_id, created_at`,
      [shopId, customerIdText]
    );
    return rows[0];
  }

  async listCartItems(client, shopId, cartId) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT ci.id, ci.cart_id, ci.product_id, ci.title_snapshot, ci.quantity::text AS quantity,
              ci.unit_label, ci.unit_price_minor, ci.is_custom, ci.custom_note,
              p.offer_price_minor_per_unit::text AS offer_price_minor_per_unit
         FROM cart_items ci
         LEFT JOIN products p ON p.id = ci.product_id AND p.shop_id = ci.shop_id
        WHERE ci.cart_id = $1::uuid
        ORDER BY ci.id ASC`,
      [cartId]
    );
    return rows;
  }

  async insertCartItem(client, row) {
    const {
      cartId,
      shopId,
      productId,
      titleSnapshot,
      quantity,
      unitLabel,
      unitPriceMinor,
      isCustom,
      customNote
    } = row;
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `INSERT INTO cart_items (cart_id, shop_id, product_id, title_snapshot, quantity, unit_label, unit_price_minor, is_custom, custom_note)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9)
       RETURNING id, cart_id, product_id, title_snapshot, quantity::text AS quantity, unit_label, unit_price_minor, is_custom, custom_note`,
      [
        cartId,
        shopId,
        productId,
        titleSnapshot,
        quantity,
        unitLabel,
        unitPriceMinor,
        isCustom,
        customNote ?? null
      ]
    );
    return rows[0];
  }

  async updateCartItemQuantity(client, shopId, cartItemId, quantity) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `UPDATE cart_items SET quantity = $2 WHERE id = $1::uuid RETURNING id, quantity::text AS quantity`,
      [cartItemId, quantity]
    );
    return rows[0] ?? null;
  }

  async deleteCartItem(client, shopId, cartItemId) {
    await setTenantContext(client, shopId);
    await client.query(`DELETE FROM cart_items WHERE id = $1::uuid`, [cartItemId]);
  }

  async deleteCartItemsForCart(client, shopId, cartId) {
    await setTenantContext(client, shopId);
    await client.query(`DELETE FROM cart_items WHERE cart_id = $1::uuid`, [cartId]);
  }

  async deleteCart(client, shopId, cartId) {
    await setTenantContext(client, shopId);
    await client.query(`DELETE FROM carts WHERE id = $1::uuid`, [cartId]);
  }

  async getProductSnapshotForCart(client, shopId, productId) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT id, name, base_unit, price_minor_per_unit, status, availability
         FROM products
        WHERE id = $1::uuid AND shop_id = $2::uuid AND status = 'active'`,
      [productId, shopId]
    );
    return rows[0] ?? null;
  }
  
  async updateCartCustomerId(client, shopId, cartId, newCustomerIdText) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `UPDATE carts SET customer_id = $2 WHERE id = $1::uuid RETURNING id`,
      [cartId, newCustomerIdText]
    );
    return rows[0] ?? null;
  }

  async findCartItemWithCart(client, shopId, itemId) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT ci.id, ci.cart_id, ci.shop_id
         FROM cart_items ci
        WHERE ci.id = $1::uuid AND ci.shop_id = $2::uuid
        LIMIT 1`,
      [itemId, shopId]
    );
    return rows[0] ?? null;
  }

  async findMatchingCartItem(client, shopId, cartId, productId, isCustom, customNote) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT id, quantity::text AS quantity
         FROM cart_items
        WHERE cart_id = $1::uuid
          AND shop_id = $2::uuid
          AND product_id IS NOT DISTINCT FROM $3::uuid
          AND is_custom = $4
          AND custom_note IS NOT DISTINCT FROM $5
        LIMIT 1`,
      [cartId, shopId, productId, isCustom, customNote]
    );
    return rows[0] ?? null;
  }

  async listCartProductAvailability(client, shopId, cartId) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT ci.id AS cart_item_id, ci.product_id, p.status AS product_status, p.availability
         FROM cart_items ci
         LEFT JOIN products p
           ON p.id = ci.product_id
          AND p.shop_id = ci.shop_id
        WHERE ci.cart_id = $1::uuid`,
      [cartId]
    );
    return rows;
  }
}
