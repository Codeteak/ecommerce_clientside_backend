import { randomUUID } from "node:crypto";
import { CartRepo } from "../../../application/ports/repositories/CartRepo.js";
import { AppError } from "../../../domain/errors/AppError.js";
import { MAX_LINE_QUANTITY } from "../../../application/services/storefront/cart/cartLineRules.js";
import { setTenantContext } from "../../../infra/db/tenantContext.js";
import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";
import {
  sellableAtPurchasePredicates,
  sellableShopProductJoin
} from "./queries/sellableShopProductSql.js";
import {
  shopProductBaseUnitSql,
  shopProductCategoryIdSql,
  shopProductImageUrlSql,
  shopProductNameSql,
  shopProductSlugSql,
  shopProductUnitSizeSql
} from "./queries/shopProductCatalogSql.js";
import {
  deleteCartRecord,
  loadCartById,
  loadCartByItemId,
  loadCartByShopCustomer,
  newCartItem,
  newCartRecord,
  saveCart
} from "./cartSessionStore.js";

function commitErr(code, message) {
  return new AppError(message, { statusCode: 400, code });
}

/**
 * Purpose: Cart item catalog enrichment uses Postgres; cart rows live in Redis or memory.
 * Storefront carts are not stored in `carts` / `cart_items` tables.
 */
export class CartRepoPg extends CartRepo {
  resolveGlobalImageUrl(raw) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) return null;
    if (value.startsWith("data:")) return null;
    if (value.includes(",")) {
      const first = value.split(",")[0].trim();
      if (/^https?:\/\//i.test(first)) return first;
      return null;
    }
    if (/^https?:\/\//i.test(value)) return value;
    return toPublicMediaUrl(value);
  }

  mapCartItemRow(row) {
    const globalImageUrl = this.resolveGlobalImageUrl(row.global_image_url);
    const image =
      globalImageUrl != null
        ? { url: globalImageUrl }
        : row.image_storage_key != null
          ? {
              mediaAssetId: row.image_media_id,
              storageKey: row.image_storage_key,
              contentType: row.image_content_type,
              url: toPublicMediaUrl(row.image_storage_key)
            }
          : null;
    return {
      ...row,
      image,
      image_url: image?.url ?? null,
      thumbnail_url: image?.url ?? null,
      thumbnail: image?.url ?? null
    };
  }

  async #enrichSessionItems(client, shopId, items) {
    if (!items.length) return [];
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT ci.id, ci.cart_id, ci.product_id, ci.title_snapshot, ci.quantity::text AS quantity,
              ci.unit_size_snapshot::text AS unit_size_snapshot,
              ci.unit_label, ci.unit_price_minor, ci.is_custom, ci.custom_note,
              sp.price_minor_per_unit::text AS list_price_minor_per_unit,
              sp.offer_price_minor_per_unit::text AS offer_price_minor_per_unit,
              ${shopProductCategoryIdSql} AS global_category_id,
              ${shopProductSlugSql} AS product_slug,
              ${shopProductImageUrlSql} AS global_image_url,
              m.id AS image_media_id,
              m.storage_key AS image_storage_key,
              m.content_type AS image_content_type
         FROM jsonb_to_recordset($2::jsonb) AS ci(
           id uuid,
           cart_id uuid,
           shop_id uuid,
           product_id uuid,
           title_snapshot text,
           quantity numeric,
           unit_size_snapshot numeric,
           unit_label text,
           unit_price_minor bigint,
           is_custom boolean,
           custom_note text
         )
         LEFT JOIN shop_products sp ON sp.id = ci.product_id AND sp.shop_id = $1::uuid
         LEFT JOIN global_products gp ON gp.id = sp.global_product_id
         LEFT JOIN LATERAL (
           WITH chosen_images AS (
             SELECT spi.media_asset_id, spi.sort_order
               FROM shop_product_images spi
              WHERE spi.shop_product_id = sp.id
             UNION ALL
             SELECT gpi.media_asset_id, gpi.sort_order
               FROM global_product_images gpi
              WHERE gpi.global_product_id = sp.global_product_id
                AND NOT EXISTS (
                  SELECT 1
                    FROM shop_product_images spi2
                   WHERE spi2.shop_product_id = sp.id
                )
           )
           SELECT img.media_asset_id
             FROM chosen_images img
            ORDER BY img.sort_order ASC
            LIMIT 1
         ) pimg ON true
         LEFT JOIN media_assets m ON m.id = pimg.media_asset_id`,
      [shopId, JSON.stringify(items)]
    );
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    return items.map((it) => this.mapCartItemRow(byId.get(String(it.id)) ?? it));
  }

  async findCartByShopAndCustomerId(_client, shopId, customerIdText) {
    const rec = await loadCartByShopCustomer(shopId, customerIdText);
    if (!rec) return null;
    return { id: rec.id, shop_id: rec.shop_id, customer_id: rec.customer_id, created_at: rec.created_at };
  }

  async insertCart(_client, shopId, customerIdText) {
    const existing = await loadCartByShopCustomer(shopId, customerIdText);
    if (existing) {
      return { id: existing.id, shop_id: existing.shop_id, customer_id: existing.customer_id, created_at: existing.created_at };
    }
    const rec = newCartRecord(shopId, customerIdText);
    await saveCart(rec);
    return { id: rec.id, shop_id: rec.shop_id, customer_id: rec.customer_id, created_at: rec.created_at };
  }

  async listCartItems(client, shopId, cartId) {
    const rec = await loadCartById(cartId);
    if (!rec || rec.shop_id !== shopId) return [];
    return this.#enrichSessionItems(client, shopId, rec.items || []);
  }

  async insertCartItem(client, row) {
    const rec = await loadCartById(row.cartId);
    if (!rec) return null;
    const item = newCartItem(row);
    rec.items = [...(rec.items || []), item];
    await saveCart(rec);
    const [enriched] = await this.#enrichSessionItems(client, row.shopId, [item]);
    return enriched ?? item;
  }

  async updateCartItemSnapshot(client, shopId, cartItemId, snapshot) {
    const rec = await this.#findRecordByItem(shopId, cartItemId);
    if (!rec) return null;
    rec.items = (rec.items || []).map((it) =>
      String(it.id) === String(cartItemId)
        ? {
            ...it,
            quantity: String(snapshot.quantity),
            unit_price_minor: Number(snapshot.unitPriceMinor),
            title_snapshot: snapshot.titleSnapshot,
            unit_label: snapshot.unitLabel,
            unit_size_snapshot: String(snapshot.unitSizeSnapshot ?? "1")
          }
        : it
    );
    await saveCart(rec);
    const item = rec.items.find((it) => String(it.id) === String(cartItemId));
    const [enriched] = await this.#enrichSessionItems(client, shopId, item ? [item] : []);
    return enriched ?? null;
  }

  async updateCartItemQuantity(client, shopId, cartItemId, quantity) {
    const rec = await this.#findRecordByItem(shopId, cartItemId);
    if (!rec) return null;
    rec.items = (rec.items || []).map((it) =>
      String(it.id) === String(cartItemId) ? { ...it, quantity: String(quantity) } : it
    );
    await saveCart(rec);
    const item = rec.items.find((it) => String(it.id) === String(cartItemId));
    const [enriched] = await this.#enrichSessionItems(client, shopId, item ? [item] : []);
    return enriched ?? null;
  }

  async deleteCartItem(_client, shopId, cartItemId) {
    const rec = await this.#findRecordByItem(shopId, cartItemId);
    if (!rec) return;
    rec.items = (rec.items || []).filter((it) => String(it.id) !== String(cartItemId));
    await saveCart(rec);
  }

  async deleteCartItemsForCart(_client, _shopId, cartId) {
    const rec = await loadCartById(cartId);
    if (!rec) return;
    rec.items = [];
    await saveCart(rec);
  }

  async deleteCart(_client, _shopId, cartId) {
    const rec = await loadCartById(cartId);
    await deleteCartRecord(rec);
  }

  async #findRecordByItem(_shopId, cartItemId) {
    return loadCartByItemId(cartItemId);
  }

  async listProductSnapshotsForCart(client, shopId, productIds) {
    const ids = Array.isArray(productIds) ? productIds.map((x) => String(x)).filter(Boolean) : [];
    if (!ids.length) return [];
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT sp.id, ${shopProductNameSql} AS name, ${shopProductBaseUnitSql} AS base_unit, ${shopProductUnitSizeSql}::text AS unit_size,
              sp.price_minor_per_unit, sp.status, sp.availability
         ${sellableShopProductJoin}
        WHERE sp.shop_id = $1::uuid
          AND sp.id = ANY($2::uuid[])
          AND ${sellableAtPurchasePredicates}`,
      [shopId, ids]
    );
    return rows;
  }

  async getProductSnapshotForCart(client, shopId, productId) {
    const rows = await this.listProductSnapshotsForCart(client, shopId, [productId]);
    return rows[0] ?? null;
  }
  
  async updateCartCustomerId(_client, shopId, cartId, newCustomerIdText) {
    const rec = await loadCartById(cartId);
    if (!rec || rec.shop_id !== shopId) return null;
    const next = {
      ...rec,
      customer_id: String(newCustomerIdText),
      items: [...(rec.items || [])]
    };
    await deleteCartRecord(rec);
    await saveCart(next);
    return { id: next.id };
  }

  async findCartItemWithCart(_client, shopId, itemId) {
    const rec = await loadCartByItemId(itemId);
    if (!rec || rec.shop_id !== shopId) return null;
    const item = (rec.items || []).find((it) => String(it.id) === String(itemId));
    if (!item) return null;
    return {
      id: item.id,
      cart_id: rec.id,
      shop_id: rec.shop_id,
      product_id: item.product_id,
      is_custom: item.is_custom,
      quantity: String(item.quantity)
    };
  }

  async findMatchingCartItem(_client, shopId, cartId, productId, isCustom, customNote) {
    const rec = await loadCartById(cartId);
    if (!rec || rec.shop_id !== shopId) return null;
    const item = (rec.items || []).find((it) => {
      const sameProduct = (it.product_id ?? null) == (productId ?? null);
      const sameCustom = Boolean(it.is_custom) === Boolean(isCustom);
      const sameNote = (it.custom_note ?? null) == (customNote ?? null);
      return sameProduct && sameCustom && sameNote;
    });
    if (!item) return null;
    return { id: item.id, quantity: String(item.quantity) };
  }

  async listCartProductAvailability(client, shopId, cartId) {
    const rec = await loadCartById(cartId);
    if (!rec || rec.shop_id !== shopId) return [];
    const items = rec.items || [];
    const productIds = items.map((it) => it.product_id).filter(Boolean);
    /** @type {Map<string, { status: string, availability: string }>} */
    const byProduct = new Map();
    if (productIds.length) {
      await setTenantContext(client, shopId);
      const { rows } = await client.query(
        `SELECT sp.id, sp.status, sp.availability
           FROM shop_products sp
          WHERE sp.shop_id = $1::uuid
            AND sp.id = ANY($2::uuid[])`,
        [shopId, productIds]
      );
      for (const r of rows) byProduct.set(String(r.id), r);
    }
    return items.map((it) => {
      const p = it.product_id ? byProduct.get(String(it.product_id)) : null;
      return {
        cart_item_id: it.id,
        product_id: it.product_id,
        product_status: p?.status ?? null,
        availability: p?.availability ?? null
      };
    });
  }

  async #lockSellableProducts(client, shopId, uniqueProductIds) {
    /** @type {Map<string, Record<string, unknown>>} */
    const lockedById = new Map();
    if (!uniqueProductIds.length) return lockedById;
    await setTenantContext(client, shopId);
    const { rows: lockedRows } = await client.query(
      `SELECT sp.id,
              ${shopProductNameSql} AS name,
              ${shopProductBaseUnitSql} AS base_unit,
              ${shopProductUnitSizeSql}::text AS unit_size,
              sp.price_minor_per_unit::text AS price_minor_per_unit,
              sp.status,
              sp.availability
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
    return lockedById;
  }

  async validateCartForCheckoutCommit(client, shopId, cartId) {
    const rec = await loadCartById(cartId);
    if (!rec || rec.shop_id !== shopId) {
      throw commitErr("CART_EMPTY", "Cart is empty");
    }
    const lines = (rec.items || []).map((it) => ({
      id: it.id,
      product_id: it.product_id,
      quantity: String(it.quantity),
      unit_price_minor: it.unit_price_minor,
      unit_size_snapshot: String(it.unit_size_snapshot ?? "1"),
      title_snapshot: it.title_snapshot,
      unit_label: it.unit_label,
      is_custom: Boolean(it.is_custom),
      custom_note: it.custom_note ?? null
    }));

    if (!lines.length) {
      throw commitErr("CART_EMPTY", "Cart is empty");
    }

    const productLines = lines.filter((l) => !l.is_custom && l.product_id);
    const uniqueProductIds = [...new Set(productLines.map((l) => String(l.product_id)))].sort((a, b) =>
      a.localeCompare(b)
    );
    const lockedById = await this.#lockSellableProducts(client, shopId, uniqueProductIds);

    for (const line of lines) {
      if (line.is_custom) continue;
      if (!line.product_id) {
        throw commitErr("PRODUCT_UNAVAILABLE", "One or more cart lines are invalid.");
      }
      const p = lockedById.get(String(line.product_id));
      if (!p) {
        throw commitErr(
          "PRODUCT_UNAVAILABLE",
          "One or more products are unavailable. Please refresh your cart."
        );
      }
      line.unit_price_minor = Number(p.price_minor_per_unit);
      if (p.name) line.title_snapshot = p.name;
      if (p.base_unit) line.unit_label = p.base_unit;
      if (p.unit_size != null) line.unit_size_snapshot = String(p.unit_size);
    }

    return lines;
  }

  /**
   * Checkout from client cart lines ({ productId, quantity }). Catalog locks and live prices;
   * client unit prices are ignored.
   */
  async validateClientLinesForCheckout(client, shopId, items) {
    const qtyByProduct = new Map();
    for (const raw of Array.isArray(items) ? items : []) {
      const productId = String(raw?.productId ?? raw?.product_id ?? "").trim();
      const quantity = Number(raw?.quantity);
      if (!productId) continue;
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw commitErr("INVALID_QUANTITY", "Quantity must be positive.");
      }
      if (quantity > MAX_LINE_QUANTITY) {
        throw commitErr("LINE_QUANTITY_CAP", `Maximum quantity per line is ${MAX_LINE_QUANTITY}.`);
      }
      const next = (qtyByProduct.get(productId) || 0) + quantity;
      if (next > MAX_LINE_QUANTITY) {
        throw commitErr("LINE_QUANTITY_CAP", `Maximum quantity per line is ${MAX_LINE_QUANTITY}.`);
      }
      qtyByProduct.set(productId, next);
    }

    if (!qtyByProduct.size) {
      throw commitErr("CART_EMPTY", "Cart is empty");
    }

    const uniqueProductIds = [...qtyByProduct.keys()].sort((a, b) => a.localeCompare(b));
    const lockedById = await this.#lockSellableProducts(client, shopId, uniqueProductIds);

    return uniqueProductIds.map((productId) => {
      const p = lockedById.get(String(productId));
      return {
        id: randomUUID(),
        product_id: productId,
        quantity: String(qtyByProduct.get(productId)),
        unit_price_minor: Number(p.price_minor_per_unit),
        unit_size_snapshot: String(p.unit_size ?? "1"),
        title_snapshot: p.name,
        unit_label: p.base_unit,
        is_custom: false,
        custom_note: null
      };
    });
  }

  async listLiveProductPricingByIds(client, shopId, productIds) {
    const ids = Array.isArray(productIds) ? productIds.map((x) => String(x)).filter(Boolean) : [];
    if (!ids.length) return [];
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT sp.id,
              sp.price_minor_per_unit::text AS price_minor_per_unit,
              sp.offer_price_minor_per_unit::text AS offer_price_minor_per_unit,
              ${shopProductCategoryIdSql} AS global_category_id
         ${sellableShopProductJoin}
        WHERE sp.shop_id = $1::uuid
          AND sp.id = ANY($2::uuid[])`,
      [shopId, ids]
    );
    return rows;
  }
}
