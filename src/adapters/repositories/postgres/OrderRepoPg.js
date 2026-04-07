import { OrderRepo } from "../../../application/ports/repositories/OrderRepo.js";
import { setTenantContext } from "../../../infra/db/tenantContext.js";

/**
 * Purpose: This file is the PostgreSQL implementation of order data access.
 * It stores new orders, inserts order items, reads order history and queue
 * data, updates order state, and writes outbox events for downstream workers.
 */
export class OrderRepoPg extends OrderRepo {
  async insertOrderWithItemsAndOutbox(client, payload) {
    const {
      shopId,
      customerIdText,
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
         shop_id, customer_id, order_number, status, payment_method,
         subtotal_minor, delivery_fee_minor, total_minor, currency, notes
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, placed_at`,
      [
        shopId,
        customerIdText,
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
      `SELECT id, order_number, status, total_minor, currency, placed_at
         FROM orders
        WHERE shop_id = $1::uuid AND customer_id = $2
        ORDER BY placed_at DESC
        LIMIT 100`,
      [shopId, customerIdText]
    );
    return rows;
  }

  async getOrderByIdForCustomer(client, shopId, orderId, customerIdText) {
    await setTenantContext(client, shopId);
    const { rows: o } = await client.query(
      `SELECT id, shop_id, customer_id, order_number, status, payment_method,
              subtotal_minor, delivery_fee_minor, total_minor, currency, notes,
              placed_at, accepted_at, out_for_delivery_at, delivered_at, rejected_at
         FROM orders
        WHERE id = $1::uuid AND shop_id = $2::uuid AND customer_id = $3
        LIMIT 1`,
      [orderId, shopId, customerIdText]
    );
    const order = o[0];
    if (!order) return null;
    const { rows: items } = await client.query(
      `SELECT id, product_id, product_name_snapshot, unit_label_snapshot,
              quantity::text AS quantity, unit_price_minor_snapshot, line_total_minor,
              is_custom, custom_note
         FROM order_items
        WHERE order_id = $1::uuid
        ORDER BY id ASC`,
      [orderId]
    );
    return { order, items };
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
}
