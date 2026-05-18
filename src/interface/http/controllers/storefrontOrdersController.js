import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { withClient } from "../../../infra/db/tx.js";
import { asyncHandler } from "../asyncHandler.js";

/**
 * Purpose: This file handles storefront order HTTP endpoints.
 * It checks customer shop access and returns order list/detail
 * responses for the authenticated customer.
 */

function listHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const shopId = requireShopId(req.shopId);
    const { customerId } = req.customerAuth;
    const limit = req.query.limit;
    const rows = await withClient(async (c) => {
      await ctx.assertCustomerShopAccess(c, shopId, customerId);
      return ctx.orderRepo.listOrdersForCustomer(c, shopId, String(customerId), { limit });
    });
    res.json({ orders: rows });
  });
}

function getByIdHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const shopId = requireShopId(req.shopId);
    const { customerId } = req.customerAuth;
    const detail = await withClient(async (c) => {
      await ctx.assertCustomerShopAccess(c, shopId, customerId);
      return ctx.orderRepo.getOrderByIdForCustomer(c, shopId, req.params.id, String(customerId));
    });
    if (!detail) {
      throw new NotFoundError("Order not found");
    }
    res.json(detail);
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
