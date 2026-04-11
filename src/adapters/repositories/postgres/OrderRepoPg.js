import { OrderRepo } from "../../../application/ports/repositories/OrderRepo.js";
import { setTenantContext } from "../../../infra/db/tenantContext.js";
import { toPublicMediaUrl } from "../../../infra/media/publicMediaUrl.js";

/**
 * Purpose: This file is the PostgreSQL implementation of order data access.
 * It stores new orders, inserts order items, reads order history and queue
 * data, updates order state, and writes outbox events for downstream workers.
 */
export class OrderRepoPg extends OrderRepo {
  mapOrderItemRow(row) {
    return {
      id: row.id,
      product_id: row.product_id,
      product_name_snapshot: row.product_name_snapshot,
      unit_label_snapshot: row.unit_label_snapshot,
      quantity: row.quantity,
      unit_price_minor_snapshot: row.unit_price_minor_snapshot,
      line_total_minor: row.line_total_minor,
      is_custom: row.is_custom,
      custom_note: row.custom_note,
      image:
        row.image_storage_key != null
          ? {
              mediaAssetId: row.image_media_id,
              storageKey: row.image_storage_key,
              contentType: row.image_content_type,
              url: toPublicMediaUrl(row.image_storage_key)
            }
          : null
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
      currency,
      notes,
      items,
      outboxPayload
    } = payload;
    await setTenantContext(client, shopId);

    const { rows: oRows } = await client.query(
      `INSERT INTO orders (
         shop_id, customer_id, customer_name, customer_phone, customer_address,
         order_number, status, payment_method,
         subtotal_minor, delivery_fee_minor, total_minor, currency, notes
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
        currency,
        notes
      ]
    );
    const order = oRows[0];

    for (const it of items) {
      await client.query(
        `INSERT INTO order_items (
           order_id, product_id, product_name_snapshot, unit_label_snapshot,
           quantity, unit_price_minor_snapshot, line_total_minor, is_custom, custom_note
         ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9)`,
        [
          order.id,
          it.productId,
          it.name,
          it.unitLabel,
          it.quantity,
          it.unitPriceMinor,
          it.lineTotalMinor,
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

  async listOrdersForCustomer(client, shopId, customerIdText) {
    await setTenantContext(client, shopId);
    const { rows } = await client.query(
      `SELECT id, order_number, status, total_minor, currency, placed_at, picker_id, picker_name
         FROM orders
        WHERE shop_id = $1::uuid AND customer_id = $2
        ORDER BY placed_at DESC
        LIMIT 100`,
      [shopId, customerIdText]
    );
    if (!rows.length) return rows;

    const orderIds = rows.map((r) => r.id);
    const { rows: itemRows } = await client.query(
      `SELECT oi.order_id, oi.id, oi.product_id, oi.product_name_snapshot, oi.unit_label_snapshot,
              oi.quantity::text AS quantity, oi.unit_price_minor_snapshot, oi.line_total_minor,
              oi.is_custom, oi.custom_note,
              m.id AS image_media_id,
              m.storage_key AS image_storage_key,
              m.content_type AS image_content_type
         FROM order_items oi
         LEFT JOIN LATERAL (
           SELECT pi.media_asset_id
             FROM product_images pi
            WHERE pi.product_id = oi.product_id
              AND pi.shop_id = $2::uuid
            ORDER BY pi.sort_order ASC
            LIMIT 1
         ) pimg ON true
         LEFT JOIN media_assets m ON m.id = pimg.media_asset_id
        WHERE oi.order_id = ANY($1::uuid[])
        ORDER BY oi.order_id ASC, oi.id ASC`,
      [orderIds, shopId]
    );

    const itemsByOrderId = new Map();
    for (const row of itemRows) {
      const key = String(row.order_id);
      const arr = itemsByOrderId.get(key) ?? [];
      arr.push(this.mapOrderItemRow(row));
      itemsByOrderId.set(key, arr);
    }

    return rows.map((row) => ({
      ...row,
      items: itemsByOrderId.get(String(row.id)) ?? []
    }));
  }

  async getOrderByIdForCustomer(client, shopId, orderId, customerIdText) {
    await setTenantContext(client, shopId);
    const { rows: o } = await client.query(
      `SELECT id, shop_id, customer_id, order_number, status, payment_method,
              subtotal_minor, delivery_fee_minor, total_minor, currency, notes,
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
              is_custom, custom_note,
              m.id AS image_media_id,
              m.storage_key AS image_storage_key,
              m.content_type AS image_content_type
         FROM order_items oi
         LEFT JOIN LATERAL (
           SELECT pi.media_asset_id
             FROM product_images pi
            WHERE pi.product_id = oi.product_id
              AND pi.shop_id = $2::uuid
            ORDER BY pi.sort_order ASC
            LIMIT 1
         ) pimg ON true
         LEFT JOIN media_assets m ON m.id = pimg.media_asset_id
        WHERE oi.order_id = $1::uuid
        ORDER BY oi.id ASC`,
      [orderId, shopId]
    );
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
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2::text || chr(0) || $3::text))`, [
      shopId,
      customerIdText,
      idempotencyKey
    ]);
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
      `SELECT id::text AS id, order_number, total_minor::text AS total_minor
         FROM orders
        WHERE id = $1::uuid AND shop_id = $2::uuid AND customer_id = $3
        LIMIT 1`,
      [orderId, shopId, customerIdText]
    );
    return rows[0] ?? null;
  }
}
