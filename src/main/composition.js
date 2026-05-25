// Purpose: This file builds the app context by creating and wiring repos, services, and middleware..
import { CatalogRepoPg } from "../adapters/repositories/postgres/CatalogRepoPg.js";
import { CartRepoPg } from "../adapters/repositories/postgres/CartRepoPg.js";
import { CustomerAuthRepoPg } from "../adapters/repositories/postgres/CustomerAuthRepoPg.js";
import { OrderRepoPg } from "../adapters/repositories/postgres/OrderRepoPg.js";
import { ShopLookupRepoPg } from "../adapters/repositories/postgres/ShopLookupRepoPg.js";
import { ShopServiceAreaRepoPg } from "../adapters/repositories/postgres/ShopServiceAreaRepoPg.js";
import { PromotionRepoPg } from "../adapters/repositories/postgres/PromotionRepoPg.js";
import { env } from "../config/env.js";
import { effectiveReadCacheTtlSec } from "../config/env/readCacheTtl.js";
import { createShopResolver } from "../interface/http/middleware/shopResolver.js";
import { createRequireCustomerJwt } from "../interface/http/middleware/requireCustomerJwt.js";
import { createLocationGuard } from "../interface/http/middleware/locationGuard.js";
import { createRequireCustomerShopAccess } from "../interface/http/middleware/requireCustomerShopAccess.js";
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
import { createRotateCustomerRefreshToken } from "../application/services/auth/rotateCustomerRefreshToken.js";
import { getCustomerProfile } from "../application/services/profile/getCustomerProfile.js";
import { updateCustomerProfile } from "../application/services/profile/updateCustomerProfile.js";
import { createUpdateStorefrontProfile } from "../application/services/profile/updateStorefrontProfile.js";
import { createRequestPhoneChangeOtp } from "../application/services/profile/requestPhoneChangeOtp.js";
import { createVerifyPhoneChangeOtp } from "../application/services/profile/verifyPhoneChangeOtp.js";
import { createCheckShopServiceArea } from "../application/services/shops/checkShopServiceArea.js";
import { createListApplicableCoupons } from "../application/services/promotions/listApplicableCoupons.js";
import { createPriceStorefrontLines } from "../application/services/promotions/priceStorefrontLines.js";
import { createEnsureShopForCatalog } from "../application/services/catalog/ensureShopForCatalog.js";
import { createCatalogCache } from "../infra/cache/catalogCache.js";
import { createShopPromotionCache } from "../infra/cache/shopPromotionCache.js";
import { createShopResolveCache } from "../infra/cache/shopResolveCache.js";
import { getSharedRedisClient } from "../infra/redis/sharedRedis.js";
import { withClient } from "../infra/db/tx.js";
import { createStorefrontCatalog } from "../application/services/storefront/storefrontCatalog.js";
import { createPrewarmStorefrontCache } from "../application/services/cache/prewarmStorefrontCache.js";
import { createStorefrontListingPromotions } from "../application/services/storefront/storefrontListingPromotions.js";
import { createStorefrontCart } from "../application/services/storefront/storefrontCart.js";
import { createCheckoutStorefront } from "../application/services/checkout/checkoutStorefront.js";
import { logger } from "../config/logger.js";
import { ConsoleSmsSender } from "../adapters/sms/consoleSmsSender.js";
import { Msg91SmsSender } from "../adapters/sms/msg91SmsSender.js";
import { SmtpOtpSender } from "../adapters/sms/smtpOtpSender.js";
import { createSessionCache } from "../utils/sessionCache.js";
import { createAccessTokenRegistry } from "../infra/auth/accessTokenRegistry.js";
import { createLogoutCustomer } from "../application/services/auth/logoutCustomer.js";

export function createAppContext() {
  const catalogRepo = new CatalogRepoPg();
  const cartRepo = new CartRepoPg();
  const orderRepo = new OrderRepoPg();
  const authRepo = new CustomerAuthRepoPg();
  const shopLookupRepo = new ShopLookupRepoPg();
  const shopServiceAreaRepo = new ShopServiceAreaRepoPg();
  const promotionRepo = new PromotionRepoPg();
  const redis = getSharedRedisClient();
  const cacheOn = env.CACHE_ON !== false;
  const catalogCacheTtlSec = effectiveReadCacheTtlSec(
    env.STOREFRONT_CATALOG_CACHE_TTL_SEC,
    cacheOn
  );
  const promoConfiguredTtlSec =
    env.STOREFRONT_PROMO_CACHE_TTL_SEC > 0
      ? env.STOREFRONT_PROMO_CACHE_TTL_SEC
      : env.STOREFRONT_CATALOG_CACHE_TTL_SEC;
  const promoCacheTtlSec = effectiveReadCacheTtlSec(promoConfiguredTtlSec, cacheOn);
  const shopResolveCacheTtlSec = effectiveReadCacheTtlSec(
    env.SHOP_RESOLVE_CACHE_TTL_SEC,
    cacheOn
  );
  const shopServiceAreaCacheTtlSec = effectiveReadCacheTtlSec(
    env.SHOP_SERVICE_AREA_CACHE_TTL_SEC,
    cacheOn
  );
  const storefrontCatalogHttpCacheSec = effectiveReadCacheTtlSec(
    env.STOREFRONT_CATALOG_HTTP_CACHE_SEC,
    cacheOn
  );

  const catalogCache = createCatalogCache({ redis });
  const shopPromotionCache = createShopPromotionCache({
    catalogCache,
    promotionRepo,
    ttlSec: promoCacheTtlSec
  });
  const shopResolveCache = createShopResolveCache({
    redis,
    shopLookupRepo,
    getShopById: async (shopId) => {
      const client = await pool.connect();
      try {
        return authRepo.getShopById(client, shopId);
      } finally {
        client.release();
      }
    },
    resolveTtlSec: shopResolveCacheTtlSec,
    metaTtlSec: shopResolveCacheTtlSec,
    serviceHubTtlSec: shopServiceAreaCacheTtlSec
  });
  const ensureShopForCatalog = createEnsureShopForCatalog({ shopResolveCache });
  const sessionCache = createSessionCache({ redis });
  const accessTokenRegistry = createAccessTokenRegistry({ redis });
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
    accessTokenRegistry,
    skipDbSessionCheck: env.NODE_ENV === "test",
    sessionValidityCache,
    shouldUseSessionCache: () => false,
    allowJtiDbFallback: env.ACCESS_JTI_DB_FALLBACK_ENABLED
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
    shopResolveCache,
    shopLookupRepo,
    storefrontRootDomain: env.STOREFRONT_ROOT_DOMAIN || null
  });

  const storefrontListingPromotions = createStorefrontListingPromotions({
    promotionRepo,
    shopPromotionCache
  });

  const storefrontCatalog = createStorefrontCatalog({
    catalogRepo,
    ensureShopForCatalog,
    catalogCache,
    shopPromotionCache,
    shopLookupRepo,
    catalogCacheTtlSec,
    productListCachePolicy: {
      maxLimit: env.STOREFRONT_PRODUCT_LIST_CACHE_MAX_LIMIT,
      maxOffset: env.STOREFRONT_PRODUCT_LIST_CACHE_MAX_OFFSET,
      searchMinChars: env.STOREFRONT_PRODUCT_SEARCH_CACHE_MIN_CHARS
    },
    runWithClient: withClient,
    listingPromotions: storefrontListingPromotions
  });

  const prewarmStorefrontCache = createPrewarmStorefrontCache({ storefrontCatalog });

  const priceStorefrontLines = createPriceStorefrontLines({
    promotionRepo,
    shopPromotionCache,
    authRepo,
    orderRepo
  });
  const listApplicableCoupons = createListApplicableCoupons({
    promotionRepo,
    shopPromotionCache,
    authRepo,
    orderRepo
  });
  const storefrontCart = createStorefrontCart({
    cartRepo,
    ensureShopForCatalog,
    priceStorefrontLines,
    listApplicableCoupons
  });
  const assertCustomerShopAccess = createAssertCustomerShopAccess({ authRepo });
  const requireCustomerShopAccess = createRequireCustomerShopAccess({ authRepo });
  const updateStorefrontProfile = createUpdateStorefrontProfile({ authRepo });
  const msg91Key = env.MSG_AUTH_KEY?.trim() || "";
  const smsSender = msg91Key
    ? new Msg91SmsSender({
        authKey: msg91Key,
        templateId: env.OTP_TEMPLATE_ID,
        shortUrl: env.MSG91_SHORT_URL,
        timeoutMs: env.MSG91_REQUEST_TIMEOUT_MS
      })
    : new ConsoleSmsSender({
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
  const buildStorefrontSession = (client, userId, sessionMeta) =>
    buildStorefrontSessionResponse(authRepo, client, userId, {
      ...sessionMeta,
      sessionCache,
      accessTokenRegistry
    });

  const verifyCustomerOtp = createVerifyCustomerOtp({
    authRepo,
    buildStorefrontSession,
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
    buildStorefrontSession,
    otpMaxAttempts: env.OTP_MAX_ATTEMPTS
  });
  const rotateCustomerRefreshToken = createRotateCustomerRefreshToken({ authRepo, accessTokenRegistry });
  const logoutCustomer = createLogoutCustomer({ authRepo, accessTokenRegistry });
  const requestPhoneChangeOtp = createRequestPhoneChangeOtp({
    authRepo,
    smsSender,
    otpTtlSeconds: env.OTP_TTL_SECONDS,
    otpResendSeconds: env.OTP_RESEND_SECONDS,
    otpRequestWindowSeconds: env.OTP_REQUEST_WINDOW_SECONDS,
    otpMaxRequestsPerWindow: env.OTP_MAX_REQUESTS_PER_WINDOW
  });
  const verifyPhoneChangeOtp = createVerifyPhoneChangeOtp({
    authRepo,
    buildStorefrontSession,
    otpMaxAttempts: env.OTP_MAX_ATTEMPTS
  });
  const checkShopServiceArea = createCheckShopServiceArea({
    shopServiceAreaRepo,
    shopResolveCache,
    defaultMaxRadiusM: env.SERVICE_AREA_RADIUS_METERS
  });

  const realtime = {
    emitOrderPlaced: () => {}
  };

  const checkoutStorefront = createCheckoutStorefront({
    cartRepo,
    orderRepo,
    authRepo,
    promotionRepo,
    priceStorefrontLines,
    checkShopServiceArea,
    deliveryFeeMinor: env.STOREFRONT_DELIVERY_FEE_MINOR,
    emitOrderPlaced: (payload) => realtime.emitOrderPlaced(payload)
  });

  return {
    shopLookupRepo,
    shopResolveCache,
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
    buildStorefrontSessionResponse: buildStorefrontSession,
    requestCustomerOtp,
    verifyCustomerOtp,
    logoutCustomer,
    rotateCustomerRefreshToken,
    requestCustomerEmailOtp,
    verifyCustomerEmailOtp,
    requestPhoneChangeOtp,
    verifyPhoneChangeOtp,
    getCustomerProfile: getCustomerProfile({ authRepo }),
    updateCustomerProfile: updateCustomerProfile({ authRepo }),
    checkShopServiceArea,
    requireCustomerJwt,
    requireCustomerShopAccess,
    locationGuard: createLocationGuard(),
    storefrontCatalog,
    storefrontCart,
    assertCustomerShopAccess,
    updateStorefrontProfile,
    listApplicableCoupons,
    checkoutStorefront,
    storefrontCatalogHttpCacheSec,
    invalidateShopCatalogCache: async (shopId, opts = {}) => {
      await catalogCache.invalidateShopCatalog(shopId);
      await shopResolveCache.invalidateShop(shopId);
      if (opts.prewarm === true) {
        return prewarmStorefrontCache(shopId, {
          topCategoryLimit: opts.topCategoryLimit
        });
      }
    },
    prewarmStorefrontCache,
    get emitOrderPlaced() {
      return realtime.emitOrderPlaced;
    },
    set emitOrderPlaced(fn) {
      realtime.emitOrderPlaced = fn;
    }
  };
}

