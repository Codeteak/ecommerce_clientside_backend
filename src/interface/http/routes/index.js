// Purpose: This file defines all HTTP routes, validation rules, and middleware order for the API.
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../../config/env.js";
import { healthController } from "../controllers/healthController.js";
import { catalogController } from "../controllers/catalogController.js";
import { authController } from "../controllers/authController.js";
import { profileController } from "../controllers/profileController.js";
import { storefrontController } from "../controllers/storefrontController.js";
import { storefrontCatalogController } from "../controllers/storefrontCatalogController.js";
import { storefrontCartController } from "../controllers/storefrontCartController.js";
import { storefrontCheckoutController } from "../controllers/storefrontCheckoutController.js";
import { storefrontAccountController } from "../controllers/storefrontAccountController.js";
import { storefrontOrdersController } from "../controllers/storefrontOrdersController.js";
import { oauthController } from "../controllers/oauthController.js";
import { validate } from "../middleware/validate.js";
import { registerBodySchema, loginBodySchema, oauthJwtBodySchema } from "../validations/authSchemas.js";
import { oauthDevGoogleStartQuerySchema, oauthSocialBodySchema } from "../validations/oauthSchemas.js";
import { patchProfileBodySchema } from "../validations/profileSchemas.js";
import { storefrontLocationBodySchema } from "../validations/storefrontSchemas.js";
import {
  storefrontCategoriesQuerySchema,
  storefrontProductsQuerySchema,
  storefrontProductSlugParamSchema
} from "../validations/storefrontCatalogSchemas.js";
import {
  storefrontAddressPatchSchema,
  storefrontAddressPostSchema,
  storefrontCartItemBodySchema,
  storefrontCartItemPatchSchema,
  storefrontCheckoutBodySchema,
  storefrontOrderIdParamSchema,
  storefrontProfilePostSchema
} from "../validations/storefrontRestSchemas.js";
import { catalogSearchQuerySchema } from "../validations/catalogSearchSchemas.js";
import { z } from "zod";

const cartItemIdParamSchema = z.object({
  itemId: z.string().uuid()
});

function toSearchParamsString(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else {
      params.set(key, String(value));
    }
  }
  return params.toString();
}

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

  const cartMutateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: env.NODE_ENV === "test" ? 10_000 : 120,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "Too many cart updates. Try again later."
        }
      });
    }
  });

  r.get("/", (_req, res) => {
    res.json({
      ok: true,
      service: "clientside-ecommerce-api",
      health: "/health",
      oauthAfterLogin: "/api/oauth/success"
    });
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

  r.post("/auth/email/register", authLimiter, validate({ body: registerBodySchema }), authController.register(ctx));
  r.post("/auth/email/login", authLimiter, validate({ body: loginBodySchema }), authController.login(ctx));
  r.post("/auth/logout", authController.logout());
  r.get("/auth/google", (req, res) => {
    const q = toSearchParamsString(req.query);
    res.redirect(302, q ? `/api/oauth/dev/google-start?${q}` : `/api/oauth/dev/google-start`);
  });

  r.get("/api/oauth/ok", oauthController.ok());
  r.get("/api/oauth/success", oauthController.success());
  r.get("/api/oauth/sign-in/social", oauthController.signInSocialGet());
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
    "/storefront/location/check",
    authLimiter,
    validate({ body: storefrontLocationBodySchema }),
    storefrontController.checkLocation(ctx)
  );

  r.get(
    "/storefront/categories",
    validate({ query: storefrontCategoriesQuerySchema }),
    storefrontCatalogController.listCategories(ctx)
  );
  r.get(
    "/storefront/products",
    validate({ query: storefrontProductsQuerySchema }),
    storefrontCatalogController.listProducts(ctx)
  );
  r.get(
    "/storefront/products/:slug",
    validate({ params: storefrontProductSlugParamSchema }),
    storefrontCatalogController.getProductBySlug(ctx)
  );

  r.post("/storefront/cart", ctx.optionalCustomerJwt, storefrontCartController.getOrCreate(ctx));
  r.get("/storefront/cart", ctx.optionalCustomerJwt, storefrontCartController.get(ctx));
  r.post(
    "/storefront/cart/items",
    ctx.optionalCustomerJwt,
    cartMutateLimiter,
    validate({ body: storefrontCartItemBodySchema }),
    storefrontCartController.addItem(ctx)
  );
  r.patch(
    "/storefront/cart/items/:itemId",
    ctx.optionalCustomerJwt,
    cartMutateLimiter,
    validate({ params: cartItemIdParamSchema, body: storefrontCartItemPatchSchema }),
    storefrontCartController.patchItem(ctx)
  );
  r.delete(
    "/storefront/cart/items/:itemId",
    ctx.optionalCustomerJwt,
    cartMutateLimiter,
    validate({ params: cartItemIdParamSchema }),
    storefrontCartController.deleteItem(ctx)
  );

  r.post(
    "/storefront/checkout",
    authLimiter,
    cartMutateLimiter,
    ctx.requireCustomerJwt,
    ctx.locationGuard,
    validate({ body: storefrontCheckoutBodySchema }),
    storefrontCheckoutController.post(ctx)
  );

  r.post(
    "/storefront/profile",
    ctx.requireCustomerJwt,
    validate({ body: storefrontProfilePostSchema }),
    storefrontAccountController.postProfile(ctx)
  );
  r.get("/storefront/address", ctx.requireCustomerJwt, storefrontAccountController.getAddress(ctx));
  r.post(
    "/storefront/address",
    ctx.requireCustomerJwt,
    validate({ body: storefrontAddressPostSchema }),
    storefrontAccountController.postAddress(ctx)
  );
  r.patch(
    "/storefront/address",
    ctx.requireCustomerJwt,
    validate({ body: storefrontAddressPatchSchema }),
    storefrontAccountController.patchAddress(ctx)
  );

  r.get("/storefront/orders", ctx.requireCustomerJwt, storefrontOrdersController.list(ctx));
  r.get(
    "/storefront/orders/:id",
    ctx.requireCustomerJwt,
    validate({ params: storefrontOrderIdParamSchema }),
    storefrontOrdersController.getById(ctx)
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
