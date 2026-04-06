import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../../config/env.js";
import { healthController } from "../controllers/healthController.js";
import { catalogController } from "../controllers/catalogController.js";
import { authController } from "../controllers/authController.js";
import { profileController } from "../controllers/profileController.js";
import { shopController } from "../controllers/shopController.js";
import { oauthController } from "../controllers/oauthController.js";
import { validate } from "../middleware/validate.js";
import { registerBodySchema, loginBodySchema, oauthJwtBodySchema } from "../validations/authSchemas.js";
import { oauthDevGoogleStartQuerySchema, oauthSocialBodySchema } from "../validations/oauthSchemas.js";
import { patchProfileBodySchema } from "../validations/profileSchemas.js";
import { shopIdParamSchema, serviceAreaCheckBodySchema } from "../validations/shopSchemas.js";
import { catalogSearchQuerySchema } from "../validations/catalogSearchSchemas.js";

export function createRoutes(ctx) {
  const r = Router();

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: env.NODE_ENV === "test" ? 10_000 : 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests. Try again later."
        }
      });
    }
  });

  r.get("/health", healthController.get(ctx));

  r.post(
    "/api/auth/register",
    authLimiter,
    validate({ body: registerBodySchema }),
    authController.register(ctx)
  );
  r.post("/api/auth/login", authLimiter, validate({ body: loginBodySchema }), authController.login(ctx));
  r.post(
    "/api/auth/oauth/jwt",
    authLimiter,
    validate({ body: oauthJwtBodySchema }),
    authController.oauthJwt(ctx)
  );

  r.get("/api/oauth/ok", oauthController.ok());
  r.get(
    "/api/oauth/dev/google-start",
    authLimiter,
    validate({ query: oauthDevGoogleStartQuerySchema }),
    oauthController.devGoogleStart(ctx)
  );
  r.post(
    "/api/oauth/sign-in/social",
    authLimiter,
    validate({ body: oauthSocialBodySchema }),
    oauthController.socialSignIn(ctx)
  );
  r.get("/api/oauth/callback/google", authLimiter, oauthController.googleCallback(ctx));

  r.get("/api/me/profile", ctx.requireCustomerJwt, profileController.get(ctx));
  r.patch(
    "/api/me/profile",
    ctx.requireCustomerJwt,
    validate({ body: patchProfileBodySchema }),
    profileController.patch(ctx)
  );

  r.post(
    "/api/shops/:shopId/service-area/check",
    validate({ params: shopIdParamSchema, body: serviceAreaCheckBodySchema }),
    shopController.checkServiceArea(ctx)
  );

  r.get("/api/catalog/categories", catalogController.listCategories(ctx));
  r.get("/api/catalog/products", catalogController.listProducts(ctx));
  r.get("/api/catalog/items", catalogController.listItems(ctx));
  r.get(
    "/api/catalog/search",
    validate({ query: catalogSearchQuerySchema }),
    catalogController.search(ctx)
  );

  return r;
}
