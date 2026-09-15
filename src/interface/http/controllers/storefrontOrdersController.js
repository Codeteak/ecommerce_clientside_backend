import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { withClient } from "../../../infra/db/tx.js";
import { asyncHandler } from "../asyncHandler.js";
import {
  syncOrderStatusFromYaadroTracking,
  syncStorefrontOrdersFromYaadroTracking
} from "../../../application/services/storefront/yaadroTrackingStatusSync.js";

/**
 * Purpose: This file handles storefront order HTTP endpoints.
 * It checks customer shop access and returns order list/detail
 * responses for the authenticated customer.
 */

/** Avoid Express ETag 304s — pollers get an empty body and the order history page goes blank. */
function sendPrivateJson(res, body) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.status(200);
  res.type("json");
  return res.end(JSON.stringify(body));
}

function listHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const shopId = requireShopId(req.shopId);
    const { customerId } = req.customerAuth;
    const limit = req.query.limit;
    const rows = await withClient(async (c) => {
      await ctx.assertCustomerShopAccess(c, shopId, customerId);
      const orders = await ctx.orderRepo.listOrdersForCustomer(c, shopId, String(customerId), {
        limit
      });
      // Pull live Yaadro delivery status into ecommerce so order history matches tracking.
      await syncStorefrontOrdersFromYaadroTracking({
        client: c,
        orderRepo: ctx.orderRepo,
        shopId,
        orders
      });
      return orders;
    });
    sendPrivateJson(res, { orders: rows });
  });
}

function getByIdHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const shopId = requireShopId(req.shopId);
    const { customerId } = req.customerAuth;
    const detail = await withClient(async (c) => {
      await ctx.assertCustomerShopAccess(c, shopId, customerId);
      const found = await ctx.orderRepo.getOrderByIdForCustomer(
        c,
        shopId,
        req.params.id,
        String(customerId)
      );
      if (!found?.order) return found;
      const next = await syncOrderStatusFromYaadroTracking({
        client: c,
        orderRepo: ctx.orderRepo,
        shopId,
        orderId: found.order.id,
        currentStatus: found.order.status,
        deliveryTrackingUrl: found.order.delivery_tracking_url
      });
      if (next) found.order.status = next;
      return found;
    });
    if (!detail) {
      throw new NotFoundError("Order not found");
    }
    sendPrivateJson(res, detail);
  });
}

export const storefrontOrdersController = {
  list: (ctx) => listHandler(ctx),
  getById: (ctx) => getByIdHandler(ctx),

  forCtx(ctx) {
    return {
      list: listHandler(ctx),
      getById: getByIdHandler(ctx)
    };
  }
};
