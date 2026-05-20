import { requireShopId } from "../catalog/catalogShopId.js";
import { AppError } from "../../../domain/errors/AppError.js";
import { getRequestLogger } from "../../../infra/logging/requestContext.js";
import {
  assertValidIdempotencyKey,
  customerAddressSnapshot,
  normalizeCouponCode,
  randomOrderNumber
} from "./checkoutInput.js";
import { createCheckoutCartValidation } from "./checkoutCartValidation.js";
import {
  recordCheckoutIdempotency,
  tryCheckoutIdempotentReplay
} from "./checkoutIdempotency.js";
import { buildCheckoutOrderLines } from "./checkoutOrderAssembly.js";
import { OUTBOX_EVENT_TYPES } from "../../constants/outboxEventTypes.js";

async function recordPromotionRedemptions({
  promotionRepo,
  client,
  shopId,
  orderId,
  customerId,
  pricedResult,
  couponDiscountMinor
}) {
  if (!promotionRepo || !pricedResult) return;

  if (pricedResult.coupon && couponDiscountMinor > 0) {
    await promotionRepo.insertPromotionRedemption(client, {
      shopId,
      orderId,
      customerId,
      promotionId: pricedResult.coupon.promotionId,
      couponId: pricedResult.coupon.id,
      discountMinor: couponDiscountMinor
    });
  }

  const autoRows = Array.isArray(pricedResult.appliedPromotionDiscounts)
    ? pricedResult.appliedPromotionDiscounts
    : [];
  for (const row of autoRows) {
    const promotionId = row?.promotionId != null ? String(row.promotionId) : "";
    const discountMinor = Math.max(0, Math.trunc(Number(row?.discountMinor) || 0));
    if (!promotionId || discountMinor <= 0) continue;
    await promotionRepo.insertPromotionRedemption(client, {
      shopId,
      orderId,
      customerId,
      promotionId,
      couponId: null,
      discountMinor
    });
  }
}

/**
 * Purpose: Storefront checkout business logic — validates input, creates orders, notifies pickers.
 */
export function createCheckoutStorefront({
  cartRepo,
  orderRepo,
  authRepo,
  checkShopServiceArea,
  deliveryFeeMinor,
  priceStorefrontLines,
  promotionRepo,
  emitOrderPlaced = null
}) {
  const cartValidation = createCheckoutCartValidation({ authRepo, checkShopServiceArea });

  return async function checkoutStorefront(client, input) {
    const log = getRequestLogger();
    const { shopId: shopRaw, customerId, userId, notes, requestMeta, idempotencyKey, couponCode: rawCoupon } =
      input;
    const couponCode = normalizeCouponCode(rawCoupon ?? null);
    const shopId = requireShopId(shopRaw);
    const rawIdem = typeof idempotencyKey === "string" ? idempotencyKey.trim() : "";
    assertValidIdempotencyKey(rawIdem);

    const logBase = {
      event: "api.checkout.failed",
      requestId: requestMeta?.requestId,
      method: requestMeta?.method,
      route: requestMeta?.route,
      shopId,
      userId,
      customerId
    };

    try {
      const profile = await cartValidation.validateCheckoutCustomer(
        client,
        shopId,
        customerId,
        userId,
        requestMeta
      );

      const custKey = String(customerId);

      const replay = await tryCheckoutIdempotentReplay({
        orderRepo,
        client,
        shopId,
        customerIdText: custKey,
        rawIdem,
        requestMeta
      });
      if (replay) {
        return replay;
      }

      const cart = await cartRepo.findCartByShopAndCustomerId(client, shopId, custKey);
      if (!cart) {
        throw new AppError("Cart not found", { statusCode: 404, code: "CART_NOT_FOUND" });
      }

      const items = await cartRepo.validateCartForCheckoutCommit(client, shopId, cart.id);

      const {
        subtotal,
        promotionDiscountTotalMinor,
        couponDiscountMinor,
        couponCodeNormalized,
        appliedPromotionIds,
        orderItems,
        pricedResult
      } = await buildCheckoutOrderLines({
        cartRepo,
        client,
        shopId,
        custKey,
        items,
        couponCode,
        priceStorefrontLines
      });

      const delivery = Number(deliveryFeeMinor) || 0;
      const total = subtotal + delivery;
      const orderNumber = randomOrderNumber();

      await cartValidation.assertAddressServiceable(
        shopId,
        profile.address,
        requestMeta,
        userId,
        customerId
      );

      const customerName = profile.display_name || "";

      const outboxPayload = {
        order_number: orderNumber,
        customer_id: customerId,
        customer_name: customerName,
        item_count: orderItems.length
      };

      const order = await orderRepo.insertOrderWithItemsAndOutbox(client, {
        shopId,
        customerIdText: custKey,
        customerName: customerName || null,
        customerPhone: profile.phone ?? null,
        customerAddress: customerAddressSnapshot(profile.address),
        orderNumber,
        status: "pending",
        paymentMethod: "cod",
        subtotalMinor: subtotal,
        deliveryFeeMinor: delivery,
        totalMinor: total,
        promotionDiscountTotalMinor,
        couponCodeNormalized,
        appliedPromotionIds,
        currency: "INR",
        notes: notes ?? null,
        items: orderItems,
        outboxPayload
      });

      await recordPromotionRedemptions({
        promotionRepo,
        client,
        shopId,
        orderId: order.id,
        customerId: custKey,
        pricedResult,
        couponDiscountMinor
      });

      await recordCheckoutIdempotency({
        orderRepo,
        client,
        shopId,
        customerIdText: custKey,
        rawIdem,
        orderId: order.id,
        cartId: cart.id
      });

      await cartRepo.deleteCartItemsForCart(client, shopId, cart.id);
      await cartRepo.deleteCart(client, shopId, cart.id);

      if (typeof emitOrderPlaced === "function") {
        const emitPayload = {
          orderId: order.id,
          shopId,
          customerId,
          orderNumber,
          totalMinor: total
        };
        try {
          emitOrderPlaced(emitPayload);
        } catch (emitErr) {
          log.warn(
            {
              event: "api.checkout.realtime_emit_failed",
              requestId: requestMeta?.requestId,
              shopId,
              customerId,
              orderId: order.id,
              err: emitErr?.message
            },
            "Realtime order emit failed; writing retry outbox event"
          );
          await orderRepo.insertOutboxEvent(client, {
            shopId,
            aggregateType: "order",
            aggregateId: order.id,
            eventType: OUTBOX_EVENT_TYPES.ORDER_PLACED_REALTIME,
            payload: emitPayload
          });
        }
      }

      log.info(
        {
          event: "api.checkout.succeeded",
          requestId: requestMeta?.requestId,
          method: requestMeta?.method,
          route: requestMeta?.route,
          shopId,
          userId,
          customerId,
          orderId: order.id,
          orderNumber,
          totalMinor: total
        },
        "Checkout succeeded"
      );

      return {
        orderId: order.id,
        orderNumber,
        subtotal_minor: subtotal,
        promotion_discount_minor: promotionDiscountTotalMinor,
        coupon_discount_minor: couponDiscountMinor,
        delivery_fee_minor: delivery,
        total_minor: total,
        coupon_code: couponCodeNormalized
      };
    } catch (err) {
      log.warn(
        {
          ...logBase,
          code: err?.code || "CHECKOUT_FAILED",
          err: err?.message
        },
        "Checkout failed"
      );
      throw err;
    }
  };
}
