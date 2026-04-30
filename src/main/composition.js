// Purpose: This file builds the app context by creating and wiring repos, services, and middleware.
import { CatalogRepoPg } from "../adapters/repositories/postgres/CatalogRepoPg.js";
import { CartRepoPg } from "../adapters/repositories/postgres/CartRepoPg.js";
import { CustomerAuthRepoPg } from "../adapters/repositories/postgres/CustomerAuthRepoPg.js";
import { OrderRepoPg } from "../adapters/repositories/postgres/OrderRepoPg.js";
import { ShopLookupRepoPg } from "../adapters/repositories/postgres/ShopLookupRepoPg.js";
import { ShopServiceAreaRepoPg } from "../adapters/repositories/postgres/ShopServiceAreaRepoPg.js";
import { env } from "../config/env.js";
import { createShopResolver } from "../interface/http/middleware/shopResolver.js";
import { createRequireCustomerJwt } from "../interface/http/middleware/requireCustomerJwt.js";
import { createLocationGuard } from "../interface/http/middleware/locationGuard.js";
import { createListCatalogItems } from "../application/services/catalog/listCatalogItems.js";
import { createListCategories } from "../application/services/catalog/listCategories.js";
import { createListProducts } from "../application/services/catalog/listProducts.js";
import { createSearchCatalog } from "../application/services/catalog/searchCatalog.js";
import { createGetHealth } from "../application/services/health/getHealth.js";
import { createGetReadiness } from "../application/services/health/getReadiness.js";
import { pool } from "../infra/db/pool.js";
import { buildStorefrontSessionResponse } from "../application/services/auth/buildStorefrontSessionResponse.js";
import { provisionCustomerForOAuthShop } from "../application/services/auth/provisionCustomerForOAuthShop.js";
import { createAssertCustomerShopAccess } from "../application/services/auth/assertCustomerShopAccess.js";
import { createRequestCustomerOtp } from "../application/services/auth/requestCustomerOtp.js";
import { createVerifyCustomerOtp } from "../application/services/auth/verifyCustomerOtp.js";
import { createRequestCustomerEmailOtp } from "../application/services/auth/requestCustomerEmailOtp.js";
import { createVerifyCustomerEmailOtp } from "../application/services/auth/verifyCustomerEmailOtp.js";
import { getCustomerProfile } from "../application/services/profile/getCustomerProfile.js";
import { updateCustomerProfile } from "../application/services/profile/updateCustomerProfile.js";
import { createUpdateStorefrontProfile } from "../application/services/profile/updateStorefrontProfile.js";
import { createCheckShopServiceArea } from "../application/services/shops/checkShopServiceArea.js";
import { createEnsureShopForCatalog } from "../application/services/catalog/ensureShopForCatalog.js";
import { createCatalogCache } from "../infra/cache/catalogCache.js";
import { getSharedRedisClient } from "../infra/redis/sharedRedis.js";
import { createStorefrontCatalog } from "../application/services/storefront/storefrontCatalog.js";
import { createStorefrontCart } from "../application/services/storefront/storefrontCart.js";
import { createCheckoutStorefront } from "../application/services/checkout/checkoutStorefront.js";
import { logger } from "../config/logger.js";
import { ConsoleSmsSender } from "../adapters/sms/consoleSmsSender.js";
import { SmtpOtpSender } from "../adapters/sms/smtpOtpSender.js";
import { createSessionCache } from "../utils/sessionCache.js";

export function createAppContext() {
  const catalogRepo = new CatalogRepoPg();
  const cartRepo = new CartRepoPg();
  const orderRepo = new OrderRepoPg();
  const authRepo = new CustomerAuthRepoPg();
  const shopLookupRepo = new ShopLookupRepoPg();
  const shopServiceAreaRepo = new ShopServiceAreaRepoPg();
  const ensureShopForCatalog = createEnsureShopForCatalog({ authRepo });
  const sessionCache = createSessionCache({ redis: getSharedRedisClient() });
  const sessionValidityCache = {
    async get(key) {
      const [userId, sessionId] = String(key || "").split(":");
      if (!userId || !sessionId) return undefined;
      return sessionCache.validateSession({ userId, sessionId });
    },
    async set(key, valid, ttlMs = env.CUSTOMER_SESSION_CHECK_CACHE_MS) {
      const [userId, sessionId] = String(key || "").split(":");
      if (!userId || !sessionId) return;
      if (valid) {
        await sessionCache.storeSession({ userId, sessionId, ttlMs });
        return;
      }
      await sessionCache.deleteSession({ userId, sessionId });
    }
  };
  const customerJwtMiddleware = createRequireCustomerJwt({
    authRepo,
    skipDbSessionCheck: env.NODE_ENV === "test",
    sessionValidityCache,
    shouldUseSessionCache: (req) =>
      req.method === "GET" && (req.path === "/api/me/profile" || req.path === "/storefront/cart")
  });
  const requireCustomerJwt = env.DISABLE_CUSTOMER_AUTH
    ? (req, _res, next) => {
        req.customerAuth = {
          userId: req.get("x-dev-user-id") || env.DEV_AUTH_USER_ID,
          customerId: req.get("x-dev-customer-id") || env.DEV_AUTH_CUSTOMER_ID,
          shopId: req.shopId || req.get("x-shop-id") || null,
          role: "customer"
        };
        next();
      }
    : customerJwtMiddleware();

  const shopResolver = createShopResolver({
    shopLookupRepo,
    storefrontRootDomain: env.STOREFRONT_ROOT_DOMAIN || null
  });

  const catalogCache = createCatalogCache({ redis: getSharedRedisClient() });

  const storefrontCatalog = createStorefrontCatalog({
    catalogRepo,
    ensureShopForCatalog,
    catalogCache,
    catalogCacheTtlSec: env.STOREFRONT_CATALOG_CACHE_TTL_SEC
  });

  const storefrontCart = createStorefrontCart({ cartRepo, ensureShopForCatalog });
  const assertCustomerShopAccess = createAssertCustomerShopAccess({ authRepo });
  const updateStorefrontProfile = createUpdateStorefrontProfile({ authRepo });
  const smsSender = new ConsoleSmsSender({
    nodeEnv: env.NODE_ENV,
    logOtpInDev: env.LOG_OTP_IN_DEV
  });
  const emailOtpSender = env.SMTP_HOST
    ? new SmtpOtpSender({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        fromEmail: env.OTP_FROM_EMAIL,
        secure: env.SMTP_SECURE
      })
    : {
        async sendOtp() {
          throw new Error("Email OTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and OTP_FROM_EMAIL.");
        }
      };
  const requestCustomerOtp = createRequestCustomerOtp({
    authRepo,
    smsSender,
    otpTtlSeconds: env.OTP_TTL_SECONDS,
    otpResendSeconds: env.OTP_RESEND_SECONDS,
    otpRequestWindowSeconds: env.OTP_REQUEST_WINDOW_SECONDS,
    otpMaxRequestsPerWindow: env.OTP_MAX_REQUESTS_PER_WINDOW
  });
  const verifyCustomerOtp = createVerifyCustomerOtp({
    authRepo,
    otpMaxAttempts: env.OTP_MAX_ATTEMPTS
  });
  const requestCustomerEmailOtp = createRequestCustomerEmailOtp({
    authRepo,
    otpSender: emailOtpSender,
    otpTtlSeconds: env.OTP_TTL_SECONDS,
    otpResendSeconds: env.OTP_RESEND_SECONDS,
    otpRequestWindowSeconds: env.OTP_REQUEST_WINDOW_SECONDS,
    otpMaxRequestsPerWindow: env.OTP_MAX_REQUESTS_PER_WINDOW
  });
  const verifyCustomerEmailOtp = createVerifyCustomerEmailOtp({
    authRepo,
    otpMaxAttempts: env.OTP_MAX_ATTEMPTS
  });
  const checkShopServiceArea = createCheckShopServiceArea({
    shopServiceAreaRepo,
    defaultMaxRadiusM: env.SERVICE_AREA_RADIUS_METERS
  });

  const realtime = {
    emitOrderPlaced: () => {}
  };

  const checkoutStorefront = createCheckoutStorefront({
    cartRepo,
    orderRepo,
    authRepo,
    checkShopServiceArea,
    deliveryFeeMinor: env.STOREFRONT_DELIVERY_FEE_MINOR,
    emitOrderPlaced: (payload) => realtime.emitOrderPlaced(payload)
  });

  return {
    shopLookupRepo,
    shopResolver,
    authRepo,
    cartRepo,
    orderRepo,
    getHealth: createGetHealth(),
    getReadiness: createGetReadiness({
      pool,
      getRedis: getSharedRedisClient,
      skipDepProbes: env.NODE_ENV === "test"
    }),
    listCatalogItems: createListCatalogItems({ catalogRepo, ensureShopForCatalog }),
    listCategories: createListCategories({ catalogRepo, ensureShopForCatalog }),
    listProducts: createListProducts({ catalogRepo, ensureShopForCatalog }),
    searchCatalog: createSearchCatalog({ catalogRepo, ensureShopForCatalog }),
    provisionCustomerForOAuthShop: provisionCustomerForOAuthShop({ authRepo }),
    buildStorefrontSessionResponse: (client, userId, sessionMeta) =>
      buildStorefrontSessionResponse(authRepo, client, userId, {
        ...sessionMeta,
        sessionCache
      }),
    requestCustomerOtp,
    verifyCustomerOtp,
    requestCustomerEmailOtp,
    verifyCustomerEmailOtp,
    getCustomerProfile: getCustomerProfile({ authRepo }),
    updateCustomerProfile: updateCustomerProfile({ authRepo }),
    checkShopServiceArea,
    requireCustomerJwt,
    locationGuard: createLocationGuard(),
    storefrontCatalog,
    storefrontCart,
    assertCustomerShopAccess,
    updateStorefrontProfile,
    checkoutStorefront,
    storefrontCatalogHttpCacheSec: env.STOREFRONT_CATALOG_HTTP_CACHE_SEC,
    invalidateShopCatalogCache: (shopId) => catalogCache.invalidateShopCatalog(shopId),
    get emitOrderPlaced() {
      return realtime.emitOrderPlaced;
    },
    set emitOrderPlaced(fn) {
      realtime.emitOrderPlaced = fn;
    }
  };
}

