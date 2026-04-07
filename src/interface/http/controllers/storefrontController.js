// Purpose: This file handles storefront location check requests and sets the serviceability cookie.
import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { env } from "../../../config/env.js";
import { getServiceabilityCookieName, signServiceabilityPayload } from "../../../infra/http/serviceabilityCookie.js";

const COOKIE_NAME = getServiceabilityCookieName();

export const storefrontController = {
  checkLocation: (ctx) => async (req, res, next) => {
    try {
      const shopId = requireShopId(req.shopId);
      const { lat, lng } = req.body;
      const result = await ctx.checkShopServiceArea({ shopId, lat, lng });
      const serviceable = Boolean(result.inServiceArea === true);
      const seal = signServiceabilityPayload({
        shopId,
        serviceable,
        lat,
        lng,
        at: new Date().toISOString()
      });
      res.cookie(COOKIE_NAME, seal, {
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        path: "/",
        maxAge: 24 * 60 * 60 * 1000
      });
      res.json({ serviceable, distanceM: result.distanceM ?? null, maxRadiusM: result.maxRadiusM ?? null });
    } catch (err) {
      next(err);
    }
  }
};
