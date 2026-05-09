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
      // #region agent log
      fetch("http://127.0.0.1:7565/ingest/29f3d452-098b-4360-9f3f-87401c89013c", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "285b0d" },
        body: JSON.stringify({
          sessionId: "285b0d",
          runId: "pre-fix",
          hypothesisId: "H4",
          location: "src/interface/http/controllers/storefrontOrdersController.js:list",
          message: "Order history response shape sample",
          data: {
            ordersCount: rows.length,
            firstItemHasImage: Boolean(rows?.[0]?.items?.[0]?.image),
            firstItemImageUrl: rows?.[0]?.items?.[0]?.image_url ?? null,
            firstItemThumbnailUrl: rows?.[0]?.items?.[0]?.thumbnail?.url ?? null
          },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion
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
