import { OrderRepo } from "../../../application/ports/repositories/OrderRepo.js";
import { setTenantContext } from "../../../infra/db/tenantContext.js";
import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";

/** Record separator for checkout idempotency advisory-lock keys (U+001E, not NUL). */
const CHECKOUT_IDEM_LOCK_SEP = "\u001e";

/**
 * Purpose: This file is the PostgreSQL implementation of order data access.
 * It stores new orders, inserts order items, reads order history and queue
 * data, updates order state, and writes outbox events for downstream workers.
 */
export class OrderRepoPg extends OrderRepo {
  debugLog(payload) {
    // #region agent log
    fetch("http://127.0.0.1:7565/ingest/29f3d452-098b-4360-9f3f-87401c89013c", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "285b0d" },
      body: JSON.stringify({ sessionId: "285b0d", ...payload, timestamp: Date.now() })
    }).catch(() => {});
    // #endregion
  }

  resolveGlobalImageUrl(raw) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    return toPublicMediaUrl(value);
  }

  mapOrderItemRow(row) {
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
    if (!image) {
      // #region agent log
      this.debugLog({
        runId: "pre-fix",
        hypothesisId: "H2",
        location: "src/adapters/repositories/postgres/OrderRepoPg.js:mapOrderItemRow",
        message: "Order item resolved to null image",
        data: {
          orderItemId: row.id ?? null,
          productId: row.product_id ?? null,
          productSlug: row.product_slug ?? null,
          globalImageUrlRaw: row.global_image_url ?? null,
          imageStorageKey: row.image_storage_key ?? null
        }
      });
      // #endregion
    }
    return {
      id: row.id,
      product_id: row.product_id,
      product_slug: row.product_slug,
      product_name_snapshot: row.product_name_snapshot,
      unit_label_snapshot: row.unit_label_snapshot,
      quantity: row.quantity,
      unit_price_minor_snapshot: row.unit_price_minor_snapshot,
      line_total_minor: row.line_total_minor,
      list_price_minor: row.list_price_minor ?? null,
      line_discount_minor: row.line_discount_minor ?? null,
      applied_promotion_ids: row.applied_promotion_ids ?? null,
      is_custom: row.is_custom,
      custom_note: row.custom_note,
      image,
      // Backward-compatible aliases used by storefront clients.
      image_url: image?.url ?? null,
      thumbnail_url: image?.url ?? null,
      thumbnail: image?.url ?? null
    };
  }

  async insertOrderWithItemsAndOutbox(client, payload) {
    const {
      shopId,
      customerIdText,
      customerName,
      customerPhone,
      customerAddress,
      orderNumber,
      status,
      paymentMethod,
      subtotalMinor,
      deliveryFeeMinor,
      totalMinor,
      promotionDiscountTotalMinor,
      couponCodeNormalized,
      appliedPromotionIds,
      currency,
      notes,
      items,
      outboxPayload
    } = payload;
    await setTenantContext(client, shopId);

    const appliedIdsJson =
      Array.isArray(appliedPromotionIds) && appliedPromotionIds.length
        ? JSON.stringify(appliedPromotionIds)
        : null;

    const { rows: oRows } = await client.query(
      `INSERT INTO orders (
         shop_id, customer_id, customer_name, customer_phone, customer_address,
         order_number, status, payment_method,
         subtotal_minor, delivery_fee_minor, total_minor,
         promotion_discount_total_minor, coupon_code_normalized, applied_promotion_ids,
         currency, notes
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16)
       RETURNING id, placed_at`,
      [
        shopId,
        customerIdText,
        customerName ?? null,
        customerPhone ?? null,
        customerAddress ?? null,
        orderNumber,
        status,
        paymentMethod,
        subtotalMinor,
        deliveryFeeMinor,
        totalMinor,
        promotionDiscountTotalMinor ?? null,
        couponCodeNormalized ?? null,
        appliedIdsJson,
        currency,
        notes
      ]
    );
    const order = oRows[0];

    for (const it of items) {
      const linePromoIds =
        Array.isArray(it.appliedPromotionIds) && it.appliedPromotionIds.length
          ? JSON.stringify(it.appliedPromotionIds)
          : null;
      await client.query(
        `INSERT INTO order_items (
           order_id, product_id, product_name_snapshot, unit_label_snapshot,
           quantity, unit_price_minor_snapshot, line_total_minor,
           list_price_minor, line_discount_minor, applied_promotion_ids,
           is_custom, custom_note
         ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)`,
        [
          order.id,
          it.productId,
          it.name,
          it.unitLabel,
          it.quantity,
          it.unitPriceMinor,
          it.lineTotalMinor,
          it.listPriceMinor ?? it.unitPriceMinor,
          it.lineDiscountMinor ?? 0,
          linePromoIds,
          it.isCustom,
          it.customNote
        ]
      );
    }

    await client.query(
      `INSERT INTO outbox_messages (aggregate_type, aggregate_id, event_type, payload_json)
       VALUES ('order', $1::uuid, 'order.created', $2::jsonb)`,
      [order.id, JSON.stringify(outboxPayload)]
    );

    return order;
  }

  async listOrdersForCustomer(client, shopId, customerIdText, opts = {}) {
    await setTenantContext(client, shopId);
    const raw = opts?.limit ?? 50;
    const limit = Math.min(Math.max(Number(raw) || 50, 1), 100);
    const { rows } = await client.query(
      `SELECT id, order_number, status, subtotal_minor, delivery_fee_minor, total_minor, currency,
              promotion_discount_total_minor, coupon_code_normalized, applied_promotion_ids,
              placed_at, picker_id, picker_name
         FROM orders
        WHERE shop_id = $1::uuid AND customer_id = $2
        ORDER BY placed_at DESC
        LIMIT $3::int`,
      [shopId, customerIdText, limit]
    );
    if (!rows.length) return rows;

    const orderIds = rows.map((r) => r.id);
    const { rows: itemRows } = await client.query(
      `SELECT oi.order_id, oi.id, oi.product_id, oi.product_name_snapshot, oi.unit_label_snapshot,
              oi.quantity::text AS quantity, oi.unit_price_minor_snapshot, oi.line_total_minor,
              oi.list_price_minor, oi.line_discount_minor, oi.applied_promotion_ids,
              oi.is_custom, oi.custom_note,
              sp.id AS shop_product_id,
              gp.slug AS product_slug,
              gp.image_url AS global_image_url,
              m.id AS image_media_id,
              m.storage_key AS image_storage_key,
              m.content_type AS image_content_type
         FROM order_items oi
         LEFT JOIN orders o
           ON o.id = oi.order_id
         LEFT JOIN shop_products sp
           ON sp.id = oi.product_id
          AND sp.shop_id = o.shop_id
         LEFT JOIN global_products gp
           ON gp.id = sp.global_product_id
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
           SELECT ci.media_asset_id
             FROM chosen_images ci
            ORDER BY ci.sort_order ASC
            LIMIT 1
         ) pimg ON true
         LEFT JOIN media_assets m ON m.id = pimg.media_asset_id
        WHERE oi.order_id = ANY($1::uuid[])
        ORDER BY oi.order_id ASC, oi.id ASC`,
      [orderIds]
    );
    // #region agent log
    this.debugLog({
      runId: "pre-fix",
      hypothesisId: "H1",
      location: "src/adapters/repositories/postgres/OrderRepoPg.js:listOrdersForCustomer",
      message: "Order history query image-source diagnostics",
      data: {
        ordersCount: rows.length,
        itemsCount: itemRows.length,
        missingShopProductJoinCount: itemRows.filter((r) => !r.shop_product_id).length,
        missingAllImageSourceCount: itemRows.filter((r) => !r.global_image_url && !r.image_storage_key).length,
        customItemCount: itemRows.filter((r) => r.is_custom).length
      }
    });
    // #endregion

    const itemsByOrderId = new Map();
    for (const row of itemRows) {
      const key = String(row.order_id);
      const arr = itemsByOrderId.get(key) ?? [];
      arr.push(this.mapOrderItemRow(row));
      itemsByOrderId.set(key, arr);
    }

    return rows.map((row) => {
      const items = itemsByOrderId.get(String(row.id)) ?? [];
      const leadImage = items.find((it) => it?.image?.url || it?.image_url)?.image ?? null;
      return {
        ...row,
        items,
        // Backward-compatible top-level aliases for order-history card UIs.
        image: leadImage,
        image_url: leadImage?.url ?? null,
        thumbnail_url: leadImage?.url ?? null,
        thumbnail: leadImage?.url ?? null
      };
    });
  }

  async getOrderByIdForCustomer(client, shopId, orderId, customerIdText) {
    await setTenantContext(client, shopId);
    const { rows: o } = await client.query(
      `SELECT id, shop_id, customer_id, order_number, status, payment_method,
              subtotal_minor, delivery_fee_minor, total_minor, currency, notes,
              promotion_discount_total_minor, coupon_code_normalized, applied_promotion_ids,
              picker_id, picker_name,
              placed_at, accepted_at, out_for_delivery_at, delivered_at, rejected_at
         FROM orders
        WHERE id = $1::uuid AND shop_id = $2::uuid AND customer_id = $3
        LIMIT 1`,
      [orderId, shopId, customerIdText]
    );
    const order = o[0];
    if (!order) return null;
    const { rows: items } = await client.query(
      `SELECT oi.id, oi.product_id, oi.product_name_snapshot, oi.unit_label_snapshot,
              quantity::text AS quantity, unit_price_minor_snapshot, line_total_minor,
              oi.list_price_minor, oi.line_discount_minor, oi.applied_promotion_ids,
              is_custom, custom_note,
              sp.id AS shop_product_id,
              gp.slug AS product_slug,
              gp.image_url AS global_image_url,
              m.id AS image_media_id,
              m.storage_key AS image_storage_key,
              m.content_type AS image_content_type
         FROM order_items oi
         LEFT JOIN orders o
           ON o.id = oi.order_id
         LEFT JOIN shop_products sp
           ON sp.id = oi.product_id
          AND sp.shop_id = o.shop_id
         LEFT JOIN global_products gp
           ON gp.id = sp.global_product_id
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
           SELECT ci.media_asset_id
             FROM chosen_images ci
            ORDER BY ci.sort_order ASC
            LIMIT 1
         ) pimg ON true
         LEFT JOIN media_assets m ON m.id = pimg.media_asset_id
        WHERE oi.order_id = $1::uuid
        ORDER BY oi.id ASC`,
      [orderId]
    );
    // #region agent log
    this.debugLog({
      runId: "pre-fix",
      hypothesisId: "H3",
      location: "src/adapters/repositories/postgres/OrderRepoPg.js:getOrderByIdForCustomer",
      message: "Order detail query image-source diagnostics",
      data: {
        orderId,
        itemsCount: items.length,
        productIdNullCount: items.filter((r) => !r.product_id).length,
        missingShopProductJoinCount: items.filter((r) => !r.shop_product_id).length,
        missingAllImageSourceCount: items.filter((r) => !r.global_image_url && !r.image_storage_key).length
      }
    });
    // #endregion
    return { order, items: items.map((row) => this.mapOrderItemRow(row)) };
  }

  async listOrdersQueueForShop(client, shopId) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT id, customer_id, order_number, status, total_minor, currency, placed_at
         FROM orders
        WHERE shop_id = $1::uuid AND status = 'pending'
        ORDER BY placed_at ASC
        LIMIT 200`,
      [shopId]
    );
    return rows;
  }

  async updateOrderStatus(client, shopId, orderId, newStatus, timestampPatch) {
    await setTenantContext(client, shopId);
    const args = [orderId, shopId, newStatus];
    const sets = [`status = $3`];
    let idx = 4;
    for (const [k, v] of Object.entries(timestampPatch)) {
      if (v !== undefined && v !== null) {
        sets.push(`${k} = $${idx}::timestamptz`);
        args.push(v);
        idx += 1;
      }
    }
    const { rows } = await client.query(
      `UPDATE orders SET ${sets.join(", ")}
        WHERE id = $1::uuid AND shop_id = $2::uuid
        RETURNING id, status`,
      args
    );
    return rows[0] ?? null;
  }

  async insertOutboxEvent(client, row) {
    await setTenantContext(client, row.shopId);
    await client.query(
      `INSERT INTO outbox_messages (aggregate_type, aggregate_id, event_type, payload_json)
       VALUES ($1, $2::uuid, $3, $4::jsonb)`,
      [row.aggregateType, row.aggregateId, row.eventType, JSON.stringify(row.payload)]
    );
  }

  async acquireCheckoutIdempotencyLock(client, shopId, customerIdText, idempotencyKey) {
    await setTenantContext(client, shopId);
    // Separator must be a bind param: Yugabyte rejects E'\\x1e' escape literals ("null character not permitted").
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2::text || $4::text || $3::text))`,
      [shopId, customerIdText, idempotencyKey, CHECKOUT_IDEM_LOCK_SEP]
    );
  }

  async findCheckoutIdempotencyOrderId(client, shopId, customerIdText, idempotencyKey) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT order_id::text AS order_id
         FROM checkout_idempotency
        WHERE shop_id = $1::uuid AND customer_id = $2 AND idempotency_key = $3
        LIMIT 1`,
      [shopId, customerIdText, idempotencyKey]
    );
    return rows[0]?.order_id ?? null;
  }

  async insertCheckoutIdempotency(client, { shopId, customerIdText, idempotencyKey, orderId }) {
    await setTenantContext(client, shopId);
    await client.query(
      `INSERT INTO checkout_idempotency (shop_id, customer_id, idempotency_key, order_id)
       VALUES ($1::uuid, $2, $3, $4::uuid)`,
      [shopId, customerIdText, idempotencyKey, orderId]
    );
  }

  async getOrderSummaryForCheckoutReplay(client, shopId, orderId, customerIdText) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT o.id::text AS id,
              o.order_number,
              o.subtotal_minor::text AS subtotal_minor,
              o.delivery_fee_minor::text AS delivery_fee_minor,
              o.total_minor::text AS total_minor,
              o.promotion_discount_total_minor::text AS promotion_discount_total_minor,
              o.coupon_code_normalized,
              COALESCE(
                (
                  SELECT SUM(pr.discount_minor)::text
                    FROM promotion_redemptions pr
                   WHERE pr.order_id = o.id
                     AND pr.shop_id = o.shop_id
                     AND pr.coupon_id IS NOT NULL
                ),
                '0'
              ) AS coupon_discount_minor
         FROM orders o
        WHERE o.id = $1::uuid AND o.shop_id = $2::uuid AND o.customer_id = $3
        LIMIT 1`,
      [orderId, shopId, customerIdText]
    );
    return rows[0] ?? null;
  }

  async countDeliveredOrdersForCustomer(client, shopId, customerIdText) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT count(*)::int AS cnt
         FROM orders
        WHERE shop_id = $1::uuid
          AND customer_id = $2
          AND status = 'delivered'`,
      [shopId, customerIdText]
    );
    return rows[0]?.cnt ?? 0;
  }
}
