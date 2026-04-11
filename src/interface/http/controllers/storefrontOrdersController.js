import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { withClient } from "../../../infra/db/tx.js";

/**
 * Purpose: This file handles storefront order HTTP endpoints.
 * It checks customer shop access and returns order list/detail
 * responses for the authenticated customer.
 */

function listHandler(ctx) {
  return async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      const { customerId } = req.customerAuth;
      const limit = req.query.limit;
      const rows = await withClient(async (c) => {
        await ctx.assertCustomerShopAccess(c, shopId, customerId);
        return ctx.orderRepo.listOrdersForCustomer(c, shopId, String(customerId), { limit });
      });
      res.json({ orders: rows });
    } catch (err) {
      next(err);
    }
  };
}

function getByIdHandler(ctx) {
  return async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      const { customerId } = req.customerAuth;
      const detail = await withClient(async (c) => {
        await ctx.assertCustomerShopAccess(c, shopId, customerId);
        return ctx.orderRepo.getOrderByIdForCustomer(c, shopId, req.params.id, String(customerId));
      });
      if (!detail) {
        return res.status(404).json({
          error: { code: "NOT_FOUND", message: "Order not found" }
        });
      }
      res.json(detail);
    } catch (err) {
      next(err);
    }
  };
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
