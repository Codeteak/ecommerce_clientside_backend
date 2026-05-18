// Purpose: Composes domain route modules and shared rate limiters for the API.

import { Router } from "express";
import { authController } from "../controllers/authController.js";
import { healthController } from "../controllers/healthController.js";
import { profileController } from "../controllers/profileController.js";
import { storefrontAccountController } from "../controllers/storefrontAccountController.js";
import { storefrontCartController } from "../controllers/storefrontCartController.js";
import { storefrontCatalogController } from "../controllers/storefrontCatalogController.js";
import { storefrontCheckoutController } from "../controllers/storefrontCheckoutController.js";
import { storefrontController } from "../controllers/storefrontController.js";
import { storefrontOrdersController } from "../controllers/storefrontOrdersController.js";
import { storefrontPromotionsController } from "../controllers/storefrontPromotionsController.js";
import { shopController } from "../controllers/shopController.js";
import { createLimiter } from "../middleware/createLimiter.js";
import { validate } from "../middleware/validate.js";
import {
  otpRequestBodySchema,
  otpVerifyBodySchema,
  refreshTokenBodySchema,
  emailOtpRequestBodySchema,
  emailOtpVerifyBodySchema
} from "../validations/authSchemas.js";
import {
  patchProfileBodySchema,
  phoneChangeRequestBodySchema,
  phoneChangeVerifyBodySchema
} from "../validations/profileSchemas.js";
import { storefrontLocationBodySchema } from "../validations/storefrontSchemas.js";
import { shopDomainQuerySchema } from "../validations/shopSchemas.js";
import {
  storefrontCategoriesQuerySchema,
  storefrontProductsQuerySchema,
  storefrontProductSlugParamSchema,
  storefrontProductIdParamSchema,
  storefrontCategorySlugParamSchema
} from "../validations/storefrontCatalogSchemas.js";
import {
  storefrontAddressPatchSchema,
  storefrontAddressPostSchema,
  storefrontCartGetQuerySchema,
  storefrontCartItemBodySchema,
  storefrontCartItemPatchSchema,
  storefrontCartItemDeleteBodySchema,
  storefrontCheckoutBodySchema,
  storefrontOrderIdParamSchema,
  storefrontProfilePostSchema,
  storefrontCouponsListQuerySchema
} from "../validations/storefrontRestSchemas.js";
import { mountAuthRoutes } from "./authRoutes.js";
import { mountCoreRoutes } from "./coreRoutes.js";
import { mountProfileRoutes } from "./profileRoutes.js";
import { mountStorefrontRoutes } from "./storefrontRoutes.js";

export function createRoutes(ctx) {
  const r = Router();
  const authScopeKey = (req) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const shopId = typeof body.shopId === "string" ? body.shopId.trim() : "";
    return `${req.ip}:${phone}:${email}:${shopId}`;
  };

  const authLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    maxTest: 10_000,
    maxProd: 60,
    message: "Too many requests. Try again later."
  });
  const otpRequestLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    maxTest: 10_000,
    maxProd: 8,
    message: "Too many OTP requests. Try again later.",
    keyGenerator: authScopeKey
  });
  const otpVerifyLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    maxTest: 10_000,
    maxProd: 20,
    message: "Too many OTP verification attempts. Try again later.",
    keyGenerator: authScopeKey
  });

  const cartMutateLimiter = createLimiter({
    windowMs: 60 * 1000,
    maxTest: 10_000,
    maxProd: 120,
    message: "Too many cart updates. Try again later."
  });

  const profileMutateLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    maxTest: 10_000,
    maxProd: 30,
    message: "Too many profile updates. Try again later.",
    keyGenerator: (req) => String(req.customerAuth?.userId || req.ip)
  });

  const addressMutateLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    maxTest: 10_000,
    maxProd: 25,
    message: "Too many address updates. Try again later.",
    keyGenerator: (req) => String(req.customerAuth?.userId || req.ip)
  });

  const couponsListLimiter = createLimiter({
    windowMs: 60 * 1000,
    maxTest: 10_000,
    maxProd: 120,
    message: "Too many coupon requests. Try again later.",
    keyGenerator: (req) => String(req.customerAuth?.userId || req.ip)
  });

  const authHandlers = authController.forCtx(ctx);
  const profileHandlers = profileController.forCtx(ctx);
  const healthHandlers = healthController.forCtx(ctx);
  const storefrontCtl = storefrontController.forCtx(ctx);
  const storefrontCat = storefrontCatalogController.forCtx(ctx);
  const storefrontCart = storefrontCartController.forCtx(ctx);
  const storefrontCheckout = storefrontCheckoutController.forCtx(ctx);
  const storefrontAccount = storefrontAccountController.forCtx(ctx);
  const storefrontOrders = storefrontOrdersController.forCtx(ctx);
  const storefrontPromotions = storefrontPromotionsController.forCtx(ctx);
  const shopCtl = shopController;

  r.get("/api/shops/resolve-by-domain", validate({ query: shopDomainQuerySchema }), shopCtl.resolveByDomain(ctx));

  mountCoreRoutes(r, {
    healthGet: healthHandlers.get,
    healthReadyGet: healthHandlers.ready
  });

  mountAuthRoutes(r, {
    authLimiter,
    otpRequestLimiter,
    otpVerifyLimiter,
    requireCustomerJwt: ctx.requireCustomerJwt,
    validate,
    handlers: authHandlers,
    otpRequestBodySchema,
    otpVerifyBodySchema,
    refreshTokenBodySchema,
    emailOtpRequestBodySchema,
    emailOtpVerifyBodySchema
  });

  mountProfileRoutes(r, {
    requireCustomerJwt: ctx.requireCustomerJwt,
    profileMutateLimiter,
    validate,
    handlers: profileHandlers,
    patchProfileBodySchema
  });

  mountStorefrontRoutes(r, {
    authLimiter,
    cartMutateLimiter,
    profileMutateLimiter,
    addressMutateLimiter,
    couponsListLimiter,
    requireCustomerJwt: ctx.requireCustomerJwt,
    requireCustomerShopAccess: ctx.requireCustomerShopAccess,
    locationGuard: ctx.locationGuard,
    validate,
    storefrontLocationBodySchema,
    storefrontCategoriesQuerySchema,
    storefrontProductsQuerySchema,
    storefrontProductSlugParamSchema,
    storefrontProductIdParamSchema,
    storefrontCategorySlugParamSchema,
    storefrontCartGetQuerySchema,
    storefrontCartItemBodySchema,
    storefrontCartItemPatchSchema,
    storefrontCartItemDeleteBodySchema,
    storefrontCheckoutBodySchema,
    storefrontProfilePostSchema,
    storefrontAddressPostSchema,
    storefrontAddressPatchSchema,
    storefrontOrderIdParamSchema,
    storefrontCouponsListQuerySchema,
    phoneChangeRequestBodySchema,
    phoneChangeVerifyBodySchema,
    storefrontCtl,
    storefrontCat,
    storefrontCart,
    storefrontCheckout,
    storefrontAccount,
    storefrontOrders,
    storefrontPromotions,
    invalidateShopCatalogCache: ctx.invalidateShopCatalogCache
  });

  return r;
}
