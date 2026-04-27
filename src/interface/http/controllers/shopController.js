export const shopController = {
  /** `GET /api/shops/resolve-by-domain?domain=...` */
  resolveByDomain: (ctx) => async (req, res, next) => {
    try {
      const { domain } = req.query;
      const shopId = await ctx.shopLookupRepo.findShopIdByDomain(domain);
      if (!shopId) {
        return res.status(404).json({
          error: {
            code: "SHOP_NOT_FOUND",
            message: "No shop found for the provided domain."
          }
        });
      }
      res.json({ shopId });
    } catch (err) {
      next(err);
    }
  },

  /** `POST /api/shops/:shopId/service-area/check` */
  checkServiceArea: (ctx) => async (req, res, next) => {
    try {
      const { shopId } = req.params;
      const { lat, lng } = req.body;
      const result = await ctx.checkShopServiceArea({ shopId, lat, lng });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
};
