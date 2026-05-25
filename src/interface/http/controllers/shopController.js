import { AppError } from "../../../domain/errors/AppError.js";
import { normalizeShopDomainInput } from "../../../domain/shop/normalizeShopDomainInput.js";
import { formatShopResolveByDomain } from "../../../application/services/shops/formatShopResolveByDomain.js";
import { asyncHandler } from "../asyncHandler.js";

export const shopController = {
  /** `GET /api/shops/resolve-by-domain?domain=...` */
  resolveByDomain: (ctx) =>
    asyncHandler(async (req, res) => {
      const domain = normalizeShopDomainInput(req.query.domain);
      const row = ctx.shopResolveCache
        ? await ctx.shopResolveCache.findShopByDomain(domain)
        : await ctx.shopLookupRepo.findShopByDomain(domain);
      const payload = formatShopResolveByDomain(row);
      if (!payload) {
        throw new AppError("No shop found for the provided domain.", {
          statusCode: 404,
          code: "SHOP_NOT_FOUND"
        });
      }
      res.json(payload);
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
