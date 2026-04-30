import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { withTx } from "../../../infra/db/tx.js";

/**
 * Purpose: This file handles storefront checkout HTTP requests.
 * It validates shop/auth context, runs checkout in a transaction,
 * and returns the created order response.
 */
function postHandler(ctx) {
  return async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      const { userId, customerId } = req.customerAuth;
      const idempotencyKey =
        typeof req.get("Idempotency-Key") === "string" ? req.get("Idempotency-Key").trim() : "";
      const out = await withTx((c) =>
        ctx.checkoutStorefront(c, {
          shopId,
          customerId,
          userId,
          notes: req.body?.notes ?? null,
          idempotencyKey,
          requestMeta: {
            requestId: req.id,
            method: req.method,
            route: req.route?.path || req.originalUrl
          }
        })
      );
      res.status(201).json(out);
    } catch (err) {
      next(err);
    }
  };
}

export const storefrontCheckoutController = {
  post: (ctx) => postHandler(ctx),

  forCtx(ctx) {
    return { post: postHandler(ctx) };
  }
};
