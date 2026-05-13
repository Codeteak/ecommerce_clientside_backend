import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { withClient } from "../../../infra/db/tx.js";

/**
 * Purpose: Handles customer promotion endpoints (read-only listing).
 */
function listCouponsHandler(ctx) {
  return async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      const { customerId } = req.customerAuth;
      const { code, cartSubtotalMinor } = req.query;

      const out = await withClient((client) =>
        ctx.listApplicableCoupons(client, {
          shopId,
          customerId,
          code: typeof code === "string" ? code : null,
          cartSubtotalMinor: typeof cartSubtotalMinor === "number" ? cartSubtotalMinor : null
        })
      );

      res.json(out);
    } catch (err) {
      next(err);
    }
  };
}

export const storefrontPromotionsController = {
  listCoupons: (ctx) => listCouponsHandler(ctx),

  forCtx(ctx) {
    return {
      listCoupons: listCouponsHandler(ctx)
    };
  }
};
