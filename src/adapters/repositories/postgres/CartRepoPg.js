import { CartRepo } from "../../../application/ports/repositories/CartRepo.js";
import { AppError } from "../../../domain/errors/AppError.js";
import { setTenantContext } from "../../../infra/db/tenantContext.js";

function commitErr(code, message) {
  return new AppError(message, { statusCode: 400, code });
}

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

  async validateCartForCheckoutCommit(client, shopId, cartId) {
    await setTenantContext(client, shopId);
    const { rows: shopRows } = await client.query(
      `SELECT inventory_tracking_enabled FROM shops WHERE id = $1::uuid LIMIT 1`,
      [shopId]
    );
    const inventoryTrackingEnabled = shopRows[0]?.inventory_tracking_enabled === true;

    const { rows: lines } = await client.query(
      `SELECT ci.id, ci.product_id, ci.quantity::text AS quantity, ci.unit_price_minor,
              ci.title_snapshot, ci.unit_label, ci.is_custom, ci.custom_note
         FROM cart_items ci
        WHERE ci.cart_id = $1::uuid AND ci.shop_id = $2::uuid
        ORDER BY ci.id ASC`,
      [cartId, shopId]
    );

    if (!lines.length) {
      throw commitErr("CART_EMPTY", "Cart is empty");
    }

    const productLines = lines.filter((l) => !l.is_custom && l.product_id);
    const sorted = [...productLines].sort((a, b) => String(a.product_id).localeCompare(String(b.product_id)));

    for (const line of sorted) {
      const { rows: pRows } = await client.query(
        `SELECT id, price_minor_per_unit, status, availability
           FROM products
          WHERE id = $1::uuid AND shop_id = $2::uuid
          FOR UPDATE`,
        [line.product_id, shopId]
      );
      const p = pRows[0];
      if (!p || p.status !== "active" || p.availability !== "in_stock") {
        throw commitErr(
          "PRODUCT_UNAVAILABLE",
          "One or more products are unavailable. Please refresh your cart."
        );
      }
      const listPrice = Number(p.price_minor_per_unit);
      if (Number(line.unit_price_minor) !== listPrice) {
        throw commitErr(
          "PRICE_CHANGED",
          "A product price was updated. Please refresh your cart and try again."
        );
      }

      if (inventoryTrackingEnabled) {
        const { rows: invRows } = await client.query(
          `SELECT stock_quantity
             FROM inventory_items
            WHERE shop_id = $1::uuid AND product_id = $2::uuid
            FOR UPDATE`,
          [shopId, line.product_id]
        );
        const inv = invRows[0];
        if (inv) {
          const qty = Number(line.quantity);
          const upd = await client.query(
            `UPDATE inventory_items
                SET stock_quantity = stock_quantity - $3::numeric
              WHERE shop_id = $1::uuid
                AND product_id = $2::uuid
                AND stock_quantity >= $3::numeric
              RETURNING id`,
            [shopId, line.product_id, qty]
          );
          if (!upd.rows.length) {
            throw commitErr(
              "INSUFFICIENT_STOCK",
              "Not enough stock for one or more items. Please adjust quantities and try again."
            );
          }
        }
      }
    }

    for (const line of lines) {
      if (line.is_custom) continue;
      if (!line.product_id) {
        throw commitErr("PRODUCT_UNAVAILABLE", "One or more cart lines are invalid.");
      }
    }

    return lines;
  }
}
