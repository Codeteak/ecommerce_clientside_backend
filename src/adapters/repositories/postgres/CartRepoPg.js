import { CartRepo } from "../../../application/ports/repositories/CartRepo.js";
import { AppError } from "../../../domain/errors/AppError.js";
import { setTenantContext } from "../../../infra/db/tenantContext.js";
import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";
import {
  sellableAtPurchasePredicates,
  sellableShopProductJoin
} from "./queries/sellableShopProductSql.js";

function commitErr(code, message) {
  return new AppError(message, { statusCode: 400, code });
}

/**
 * Purpose: This file is the PostgreSQL implementation of cart data access.
 * It performs tenant-scoped cart queries and writes for creating carts,
 * managing cart items, and merging guest carts into customer carts.
 */
export class CartRepoPg extends CartRepo {
  resolveGlobalImageUrl(raw) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    return toPublicMediaUrl(value);
  }

  mapCartItemRow(row) {
    const globalImageUrl = this.resolveGlobalImageUrl(row.global_image_url);
    return {
      ...row,
      image:
        globalImageUrl != null
          ? { url: globalImageUrl }
          : row.image_storage_key != null
            ? {
                mediaAssetId: row.image_media_id,
                storageKey: row.image_storage_key,
                contentType: row.image_content_type,
                url: toPublicMediaUrl(row.image_storage_key)
              }
            : null
    };
  }

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
              sp.offer_price_minor_per_unit::text AS offer_price_minor_per_unit,
              gp.slug AS product_slug,
              gp.image_url AS global_image_url,
              m.id AS image_media_id,
              m.storage_key AS image_storage_key,
              m.content_type AS image_content_type
         FROM cart_items ci
         LEFT JOIN shop_products sp ON sp.id = ci.product_id AND sp.shop_id = ci.shop_id
         LEFT JOIN global_products gp ON gp.id = sp.global_product_id
         LEFT JOIN LATERAL (
           SELECT spi.media_asset_id
             FROM shop_product_images spi
            WHERE spi.shop_product_id = sp.id
            ORDER BY spi.sort_order ASC
            LIMIT 1
         ) spimg ON true
         LEFT JOIN LATERAL (
           SELECT gpi.media_asset_id
             FROM global_product_images gpi
            WHERE gpi.global_product_id = gp.id
            ORDER BY gpi.sort_order ASC
            LIMIT 1
         ) gpimg ON true
         LEFT JOIN LATERAL (
           SELECT COALESCE(spimg.media_asset_id, gpimg.media_asset_id) AS media_asset_id
         ) pimg ON true
         LEFT JOIN media_assets m ON m.id = pimg.media_asset_id
        WHERE ci.cart_id = $1::uuid
        ORDER BY ci.id ASC`,
      [cartId]
    );
    return rows.map((row) => this.mapCartItemRow(row));
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
      `WITH ins AS (
         INSERT INTO cart_items (cart_id, shop_id, product_id, title_snapshot, quantity, unit_label, unit_price_minor, is_custom, custom_note)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9)
         RETURNING id, cart_id, shop_id, product_id, title_snapshot, quantity::text AS quantity, unit_label, unit_price_minor, is_custom, custom_note
       )
       SELECT ins.id, ins.cart_id, ins.product_id, ins.title_snapshot, ins.quantity, ins.unit_label, ins.unit_price_minor, ins.is_custom, ins.custom_note,
             gp.slug AS product_slug,
             gp.image_url AS global_image_url,
             m.id AS image_media_id,
             m.storage_key AS image_storage_key,
             m.content_type AS image_content_type
         FROM ins
         LEFT JOIN shop_products sp ON sp.id = ins.product_id AND sp.shop_id = ins.shop_id
         LEFT JOIN global_products gp ON gp.id = sp.global_product_id
         LEFT JOIN LATERAL (
           SELECT spi.media_asset_id
             FROM shop_product_images spi
            WHERE spi.shop_product_id = sp.id
            ORDER BY spi.sort_order ASC
            LIMIT 1
         ) spimg ON true
         LEFT JOIN LATERAL (
           SELECT gpi.media_asset_id
             FROM global_product_images gpi
            WHERE gpi.global_product_id = gp.id
            ORDER BY gpi.sort_order ASC
            LIMIT 1
         ) gpimg ON true
         LEFT JOIN LATERAL (
           SELECT COALESCE(spimg.media_asset_id, gpimg.media_asset_id) AS media_asset_id
         ) pimg ON true
         LEFT JOIN media_assets m ON m.id = pimg.media_asset_id`,
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
    return rows[0] ? this.mapCartItemRow(rows[0]) : null;
  }

  async updateCartItemQuantity(client, shopId, cartItemId, quantity) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `WITH upd AS (
         UPDATE cart_items
            SET quantity = $2
          WHERE id = $1::uuid
          RETURNING id, quantity::text AS quantity, shop_id, product_id
       )
      SELECT upd.id, upd.quantity, gp.slug AS product_slug,
             gp.image_url AS global_image_url,
             m.id AS image_media_id,
             m.storage_key AS image_storage_key,
             m.content_type AS image_content_type
         FROM upd
         LEFT JOIN shop_products sp ON sp.id = upd.product_id AND sp.shop_id = upd.shop_id
        LEFT JOIN global_products gp ON gp.id = sp.global_product_id
        LEFT JOIN LATERAL (
          SELECT spi.media_asset_id
            FROM shop_product_images spi
           WHERE spi.shop_product_id = sp.id
           ORDER BY spi.sort_order ASC
           LIMIT 1
        ) spimg ON true
        LEFT JOIN LATERAL (
          SELECT gpi.media_asset_id
            FROM global_product_images gpi
           WHERE gpi.global_product_id = gp.id
           ORDER BY gpi.sort_order ASC
           LIMIT 1
        ) gpimg ON true
        LEFT JOIN LATERAL (
          SELECT COALESCE(spimg.media_asset_id, gpimg.media_asset_id) AS media_asset_id
        ) pimg ON true
        LEFT JOIN media_assets m ON m.id = pimg.media_asset_id`,
      [cartItemId, quantity]
    );
    return rows[0] ? this.mapCartItemRow(rows[0]) : null;
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
      `SELECT sp.id, gp.name, gp.base_unit, sp.price_minor_per_unit, sp.status, sp.availability
         ${sellableShopProductJoin}
        WHERE sp.id = $1::uuid
          AND sp.shop_id = $2::uuid
          AND ${sellableAtPurchasePredicates}`,
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
      `SELECT ci.id AS cart_item_id, ci.product_id, sp.status AS product_status, sp.availability
         FROM cart_items ci
         LEFT JOIN shop_products sp
           ON sp.id = ci.product_id
          AND sp.shop_id = ci.shop_id
        WHERE ci.cart_id = $1::uuid`,
      [cartId]
    );
    return rows;
  }

  async validateCartForCheckoutCommit(client, shopId, cartId) {
    await setTenantContext(client, shopId);
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
    const uniqueProductIds = [...new Set(productLines.map((l) => l.product_id))].sort((a, b) =>
      String(a).localeCompare(String(b))
    );

    /** @type {Map<string, { id: string, price_minor_per_unit: string, status: string, availability: string }>} */
    const lockedById = new Map();
    if (uniqueProductIds.length) {
      const { rows: lockedRows } = await client.query(
        `SELECT sp.id, sp.price_minor_per_unit::text AS price_minor_per_unit, sp.status, sp.availability
           ${sellableShopProductJoin}
          WHERE sp.shop_id = $1::uuid
            AND sp.id = ANY($2::uuid[])
            AND ${sellableAtPurchasePredicates}
          ORDER BY sp.id
          FOR UPDATE OF sp`,
        [shopId, uniqueProductIds]
      );
      if (lockedRows.length !== uniqueProductIds.length) {
        throw commitErr(
          "PRODUCT_UNAVAILABLE",
          "One or more products are unavailable. Please refresh your cart."
        );
      }
      for (const r of lockedRows) {
        lockedById.set(String(r.id), r);
      }
    }

    for (const line of lines) {
      if (line.is_custom || !line.product_id) continue;
      const p = lockedById.get(String(line.product_id));
      if (!p) {
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
