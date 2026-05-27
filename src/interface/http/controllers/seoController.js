import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { asyncHandler } from "../asyncHandler.js";

function shopIdForMetadata(req) {
  if (!req.shopId) {
    throw new ValidationError("shopId is required (x-shop-id header or host resolution)");
  }
  return String(req.shopId).trim();
}

export const seoController = {
  getMetadata: (ctx) =>
    asyncHandler(async (req, res) => {
      const shopId = shopIdForMetadata(req);
      const { pageType, slug } = req.query;
      const payload = await ctx.getPageMetadata(shopId, pageType, slug);
      res.json(payload);
    })
};
