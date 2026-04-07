import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { withClient } from "../../../infra/db/tx.js";

/**
 * Purpose: This file handles storefront order HTTP endpoints.
 * It checks customer shop access and returns order list/detail
 * responses for the authenticated customer.
 */
export const storefrontOrdersController = {
  list: (ctx) => async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      const { customerId } = req.customerAuth;
      const rows = await withClient(async (c) => {
        await ctx.assertCustomerShopAccess(c, shopId, customerId);
        return ctx.orderRepo.listOrdersForCustomer(c, shopId, String(customerId));
      });
      res.json({ orders: rows });
    } catch (err) {
      next(err);
    }
  },

  getById: (ctx) => async (req, res, next) => {
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
  }
};
