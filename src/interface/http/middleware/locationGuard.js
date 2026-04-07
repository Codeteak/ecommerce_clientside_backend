import { env } from "../../../config/env.js";
import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { verifyServiceabilityCookie, getServiceabilityCookieName } from "../../../infra/http/serviceabilityCookie.js";

/**
 * When `STOREFRONT_ENFORCE_SERVICEABILITY` is true, checkout requires a valid
 * `storefront_serviceability` cookie for the resolved shop with `serviceable: true`.
 */
export function createLocationGuard() {
  /** @type {import("express").RequestHandler} */
  return (req, res, next) => {
    if (!env.STOREFRONT_ENFORCE_SERVICEABILITY) {
      return next();
    }
    try {
      const shopId = requireShopId(req.shopId);
      const raw = req.cookies?.[getServiceabilityCookieName()];
      const payload = verifyServiceabilityCookie(raw);
      if (!payload || payload.shopId !== shopId || payload.serviceable !== true) {
        return res.status(403).json({
          error: {
            code: "SERVICE_AREA",
            message: "Location not verified as serviceable for this shop"
          }
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
