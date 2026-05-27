// Purpose: This file handles storefront location check requests and sets the serviceability cookie.
import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { env } from "../../../config/env.js";
import { getServiceabilityCookieName, signServiceabilityPayload } from "../../../infra/http/serviceabilityCookie.js";
import { asyncHandler } from "../asyncHandler.js";

const COOKIE_NAME = getServiceabilityCookieName();

function checkLocationHandler(ctx) {
  return asyncHandler(async (req, res) => {
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
    const cookieOptions = {
      httpOnly: true,
      sameSite: env.SERVICEABILITY_COOKIE_SAMESITE,
      secure: env.SERVICEABILITY_COOKIE_SECURE,
      path: "/",
      maxAge: 24 * 60 * 60 * 1000
    };
    if (env.SERVICEABILITY_COOKIE_DOMAIN) {
      cookieOptions.domain = env.SERVICEABILITY_COOKIE_DOMAIN;
    }
    res.cookie(COOKIE_NAME, seal, cookieOptions);
    res.json({
      serviceable,
      distanceM: result.distanceM ?? null,
      maxRadiusM: result.maxRadiusM ?? null,
      shopLocation: result.shopLocation ?? null
    });
  });
}

export const storefrontController = {
  checkLocation: (ctx) => checkLocationHandler(ctx),

  forCtx(ctx) {
    return { checkLocation: checkLocationHandler(ctx) };
  }
};
