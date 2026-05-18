import { withClient, withTx } from "../../../infra/db/tx.js";
import { asyncHandler } from "../asyncHandler.js";

function getHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const { customerId, userId } = req.customerAuth;
    const result = await withClient((client) =>
      ctx.getCustomerProfile(client, { customerId, userId })
    );
    res.json(result);
  });
}

function patchHandler(ctx) {
  return asyncHandler(async (req, res) => {
    const { customerId, userId } = req.customerAuth;
    const result = await withTx((client) =>
      ctx.updateCustomerProfile(client, {
        customerId,
        userId,
        patch: req.body
      })
    );
    res.json(result);
  });
}

export const profileController = {
  get: (ctx) => getHandler(ctx),
  patch: (ctx) => patchHandler(ctx),

  forCtx(ctx) {
    return {
      get: getHandler(ctx),
      patch: patchHandler(ctx)
    };
  }
};
