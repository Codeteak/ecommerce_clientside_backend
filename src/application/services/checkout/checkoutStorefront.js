import { requireShopId } from "../catalog/catalogShopId.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { AppError } from "../../../domain/errors/AppError.js";
import crypto from "node:crypto";
import { logger } from "../../../config/logger.js";

/**
 * Purpose: This file handles storefront checkout business logic.
 * It validates checkout input, creates the order, and then notifies
 * all picker clients for the same shop_id that a new order was placed.
 */
function randomOrderNumber() {
  return `ORD-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

function minorFromLine(q, unitPrice) {
  const line = Number(q) * Number(unitPrice);
  return Math.round(line);
}

function checkoutError(code, message) {
  return new AppError(message, { statusCode: 400, code });
}

function customerAddressSnapshot(addr) {
  if (!addr) return null;
  const parts = [addr.line1, addr.line2, addr.landmark, addr.city, addr.state, addr.postalCode, addr.country]
    .map((x) => (x != null && String(x).trim() !== "" ? String(x).trim() : null))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function createCheckoutStorefront({
  cartRepo,
  orderRepo,
  authRepo,
  checkShopServiceArea,
  deliveryFeeMinor,
  emitOrderPlaced = null
}) {
  return async function checkoutStorefront(client, input) {
    const { shopId: shopRaw, customerId, userId, addressId, notes, requestMeta, idempotencyKey } = input;
    const shopId = requireShopId(shopRaw);
    const rawIdem = typeof idempotencyKey === "string" ? idempotencyKey.trim() : "";
    if (rawIdem && (rawIdem.length < 8 || rawIdem.length > 128)) {
      throw checkoutError(
        "INVALID_IDEMPOTENCY_KEY",
        "Idempotency-Key header must be between 8 and 128 characters when provided."
      );
    }
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
      const membership = await authRepo.getMembershipByCustomerAndShop(client, customerId, shopId);
      if (!membership?.is_active || membership.is_blocked || membership.is_deleted) {
        throw new ValidationError("No access to this shop");
      }

      const profile = await authRepo.getCustomerProfileByCustomerId(client, customerId);
      if (!profile || profile.is_blocked || profile.is_deleted) {
        throw new ValidationError("Invalid customer");
      }
      if (profile.user_id !== userId) {
        throw new ValidationError("Invalid customer");
      }
      if (!profile.phone || String(profile.phone).trim() === "") {
        throw checkoutError("PHONE_REQUIRED", "Phone number is required before checkout");
      }
      if (!profile.address || !profile.address.id || !profile.address.line1) {
        throw checkoutError("ADDRESS_REQUIRED", "Delivery address is required");
      }
      if (String(profile.address.id) !== String(addressId)) {
        throw checkoutError("ADDRESS_INVALID", "Selected address is invalid for this user");
      }
      if (profile.address.lat == null || profile.address.lng == null) {
        throw checkoutError("ADDRESS_COORDINATES_REQUIRED", "Selected address must include location coordinates");
      }

      const service = await checkShopServiceArea({
        shopId,
        lat: Number(profile.address.lat),
        lng: Number(profile.address.lng)
      });
      if (!service.inServiceArea) {
        logger.warn(
          {
            event: "api.checkout.failed",
            requestId: requestMeta?.requestId,
            method: requestMeta?.method,
            route: requestMeta?.route,
            shopId,
            userId,
            customerId,
            code: service.code || "ADDRESS_NOT_SERVICEABLE",
            distanceM: service.distanceM ?? null,
            maxRadiusM: service.maxRadiusM ?? null,
            addressLat: Number(profile.address.lat),
            addressLng: Number(profile.address.lng)
          },
          "Checkout serviceability rejected"
        );
        if (service.code === "SHOP_UNAVAILABLE") {
          throw checkoutError("SHOP_UNAVAILABLE", service.message || "This shop is not available for orders.");
        }
        if (service.code === "SHOP_LOCATION_MISSING") {
          throw checkoutError("SHOP_LOCATION_MISSING", service.message || "Shop delivery location is not configured.");
        }
        if (service.code === "ADDRESS_COORDINATES_INVALID") {
          throw checkoutError(
            "ADDRESS_COORDINATES_INVALID",
            service.message || "Selected address coordinates are invalid."
          );
        }
        throw checkoutError("ADDRESS_NOT_SERVICEABLE", "Selected address is not serviceable for delivery");
      }

      const custKey = String(customerId);

      if (rawIdem) {
        await orderRepo.acquireCheckoutIdempotencyLock(client, shopId, custKey, rawIdem);
        const existingOrderId = await orderRepo.findCheckoutIdempotencyOrderId(client, shopId, custKey, rawIdem);
        if (existingOrderId) {
          const summary = await orderRepo.getOrderSummaryForCheckoutReplay(
            client,
            shopId,
            existingOrderId,
            custKey
          );
          if (summary) {
            logger.info(
              {
                event: "api.checkout.idempotent_replay",
                requestId: requestMeta?.requestId,
                shopId,
                customerId,
                orderId: summary.id
              },
              "Checkout idempotent replay"
            );
            return {
              orderId: summary.id,
              orderNumber: summary.order_number,
              total_minor: Number(summary.total_minor)
            };
          }
        }
      }

      const cart = await cartRepo.findCartByShopAndCustomerId(client, shopId, custKey);
      if (!cart) {
        throw new AppError("Cart not found", { statusCode: 404, code: "CART_NOT_FOUND" });
      }

      const items = await cartRepo.validateCartForCheckoutCommit(client, shopId, cart.id);

      let subtotal = 0;
      const orderItems = items.map((it) => {
        const lineTotal = minorFromLine(it.quantity, it.unit_price_minor);
        subtotal += lineTotal;
        return {
          productId: it.product_id,
          name: it.title_snapshot,
          unitLabel: it.unit_label,
          quantity: Number(it.quantity),
          unitPriceMinor: Number(it.unit_price_minor),
          lineTotalMinor: lineTotal,
          isCustom: it.is_custom,
          customNote: it.custom_note
        };
      });

      const delivery = Number(deliveryFeeMinor) || 0;
      const total = subtotal + delivery;
      const orderNumber = randomOrderNumber();

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
        currency: "INR",
        notes: notes ?? null,
        items: orderItems,
        outboxPayload
      });

      if (rawIdem) {
        await orderRepo.insertCheckoutIdempotency(client, {
          shopId,
          customerIdText: custKey,
          idempotencyKey: rawIdem,
          orderId: order.id
        });
      }

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
          logger.warn(
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
            eventType: "order.placed.realtime.retry",
            payload: emitPayload
          });
        }
      }

      logger.info(
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

      return { orderId: order.id, orderNumber, total_minor: total };
    } catch (err) {
      logger.warn(
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
