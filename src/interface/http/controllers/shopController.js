import { AppError } from "../../../domain/errors/AppError.js";
import { asyncHandler } from "../asyncHandler.js";

export const shopController = {
  /** `GET /api/shops/resolve-by-domain?domain=...` */
  resolveByDomain: (ctx) =>
    asyncHandler(async (req, res) => {
      const { domain } = req.query;
      const shopId = ctx.shopResolveCache
        ? await ctx.shopResolveCache.findShopIdByDomain(domain)
        : await ctx.shopLookupRepo.findShopIdByDomain(domain);
      if (!shopId) {
        throw new AppError("No shop found for the provided domain.", {
          statusCode: 404,
          code: "SHOP_NOT_FOUND"
        });
      }
      res.json({ shopId });
    }),

  /** `POST /api/shops/:shopId/service-area/check` */
  checkServiceArea: (ctx) =>
    asyncHandler(async (req, res) => {
      const { shopId } = req.params;
      const { lat, lng } = req.body;
      const result = await ctx.checkShopServiceArea({ shopId, lat, lng });
      res.json(result);
    })
};
