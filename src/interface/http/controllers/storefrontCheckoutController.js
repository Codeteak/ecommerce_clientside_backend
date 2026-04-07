import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { withTx } from "../../../infra/db/tx.js";

/**
 * Purpose: This file handles storefront checkout HTTP requests.
 * It validates shop/auth context, runs checkout in a transaction,
 * and returns the created order response.
 */
export const storefrontCheckoutController = {
  post: (ctx) => async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      const { userId, customerId } = req.customerAuth;
      const out = await withTx((c) =>
        ctx.checkoutStorefront(c, {
          shopId,
          customerId,
          userId,
          notes: req.body?.notes ?? null
        })
      );
      res.status(201).json(out);
    } catch (err) {
      next(err);
    }
  }
};
