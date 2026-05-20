import { getRequestLogger } from "../../../infra/logging/requestContext.js";

export async function tryCheckoutIdempotentReplay({
  orderRepo,
  client,
  shopId,
  customerIdText,
  rawIdem,
  requestMeta
}) {
  if (!rawIdem) {
    return null;
  }

  await orderRepo.acquireCheckoutIdempotencyLock(client, shopId, customerIdText, rawIdem);
  const existingOrderId = await orderRepo.findCheckoutIdempotencyOrderId(
    client,
    shopId,
    customerIdText,
    rawIdem
  );
  if (!existingOrderId) {
    return null;
  }

  const summary = await orderRepo.getOrderSummaryForCheckoutReplay(
    client,
    shopId,
    existingOrderId,
    customerIdText
  );
  if (!summary) {
    return null;
  }

  getRequestLogger().info(
    {
      event: "api.checkout.idempotent_replay",
      requestId: requestMeta?.requestId,
      shopId,
      customerId: customerIdText,
      orderId: summary.id
    },
    "Checkout idempotent replay"
  );

  return {
    orderId: summary.id,
    orderNumber: summary.order_number,
    subtotal_minor: summary.subtotal_minor != null ? Number(summary.subtotal_minor) : undefined,
    promotion_discount_minor:
      summary.promotion_discount_total_minor != null
        ? Number(summary.promotion_discount_total_minor)
        : undefined,
    coupon_discount_minor:
      summary.coupon_discount_minor != null ? Number(summary.coupon_discount_minor) : undefined,
    delivery_fee_minor:
      summary.delivery_fee_minor != null ? Number(summary.delivery_fee_minor) : undefined,
    total_minor: Number(summary.total_minor),
    coupon_code: summary.coupon_code_normalized ?? null
  };
}

export async function recordCheckoutIdempotency({
  orderRepo,
  client,
  shopId,
  customerIdText,
  rawIdem,
  orderId,
  cartId = null
}) {
  if (!rawIdem) return;
  await orderRepo.insertCheckoutIdempotency(client, {
    shopId,
    customerIdText,
    idempotencyKey: rawIdem,
    orderId,
    cartId
  });
}
