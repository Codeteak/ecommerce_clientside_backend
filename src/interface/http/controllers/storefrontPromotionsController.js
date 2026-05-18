import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { withClient } from "../../../infra/db/tx.js";
import { asyncHandler } from "../asyncHandler.js";

/**
 * Purpose: Handles customer promotion endpoints (read-only listing).
 */
function listCouponsHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const shopId = requireShopId(req.shopId);
    const { customerId } = req.customerAuth;
    const { code, cartSubtotalMinor, onlyApplicable } = req.query;

    const out = await withClient((client) =>
      ctx.listApplicableCoupons(client, {
        shopId,
        customerId,
        code: typeof code === "string" ? code : null,
        cartSubtotalMinor: typeof cartSubtotalMinor === "number" ? cartSubtotalMinor : null,
        onlyApplicable: onlyApplicable === true
      })
    );

    res.json(out);
  });
}

export const storefrontPromotionsController = {
  listCoupons: (ctx) => listCouponsHandler(ctx),

  forCtx(ctx) {
    return {
      listCoupons: listCouponsHandler(ctx)
    };
  }
};
