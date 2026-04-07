import { requireShopId } from "../catalog/catalogShopId.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import crypto from "node:crypto";

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

export function createCheckoutStorefront({
  cartRepo,
  orderRepo,
  authRepo,
  deliveryFeeMinor,
  emitOrderNew = null
}) {
  return async function checkoutStorefront(client, input) {
    const { shopId: shopRaw, customerId, userId, notes } = input;
    const shopId = requireShopId(shopRaw);

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
    if (!profile.address || !profile.address.line1) {
      throw new ValidationError("Delivery address is required");
    }

    const custKey = String(customerId);
    const cart = await cartRepo.findCartByShopAndCustomerId(client, shopId, custKey);
    if (!cart) {
      throw new NotFoundError("Cart not found");
    }
    const items = await cartRepo.listCartItems(client, shopId, cart.id);
    if (!items.length) {
      throw new ValidationError("Cart is empty");
    }

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

    await cartRepo.deleteCartItemsForCart(client, shopId, cart.id);
    await cartRepo.deleteCart(client, shopId, cart.id);

    if (typeof emitOrderNew === "function") {
      emitOrderNew({
        shopId,
        order_id: order.id,
        order_number: orderNumber,
        items: orderItems.map((x) => ({
          name: x.name,
          quantity: x.quantity,
          unit_label: x.unitLabel
        })),
        customer_name: customerName
      });
    }

    return { orderId: order.id, orderNumber, total_minor: total };
  };
}
