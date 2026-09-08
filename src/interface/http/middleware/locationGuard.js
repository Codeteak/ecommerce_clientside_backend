import { env } from "../../../config/env.js";
import { requireShopId } from "../../../application/services/catalog/catalogShopId.js";
import { verifyServiceabilityCookie, getServiceabilityCookieName } from "../../../infra/http/serviceabilityCookie.js";
import { getRequestLogger } from "../../../infra/logging/requestContext.js";

/**
 * When `STOREFRONT_ENFORCE_SERVICEABILITY` is true:
 * - Valid cookie with `serviceable: false` for this shop → 403 early
 * - Missing / invalid cookie → allow through; checkout still runs
 *   `assertAddressServiceable` on the saved address (source of truth)
 *
 * We do NOT require the cookie to be present. Storefront cookies often fail to
 * stick across same-origin proxies / cross-subdomain hosts, which caused false
 * 403 "Location not verified as serviceable for this shop" with durationMs≈0.
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

      if (payload && payload.shopId === shopId && payload.serviceable === false) {
        return res.status(403).json({
          error: {
            code: "SERVICE_AREA",
            message: "Location not verified as serviceable for this shop"
          }
        });
      }

      if (!payload || payload.shopId !== shopId || payload.serviceable !== true) {
        getRequestLogger().warn(
          {
            event: "api.checkout.serviceability_cookie_missing",
            shopId,
            hasCookie: Boolean(raw),
            cookieShopId: payload?.shopId ?? null,
            cookieServiceable: payload?.serviceable ?? null
          },
          "Serviceability cookie missing or mismatched; relying on address distance check"
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
