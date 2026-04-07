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
import { createOptionalCustomerJwt } from "../interface/http/middleware/optionalCustomerJwt.js";
import { createLocationGuard } from "../interface/http/middleware/locationGuard.js";
import { createListCatalogItems } from "../application/services/catalog/listCatalogItems.js";
import { createListCategories } from "../application/services/catalog/listCategories.js";
import { createListProducts } from "../application/services/catalog/listProducts.js";
import { createSearchCatalog } from "../application/services/catalog/searchCatalog.js";
import { createGetHealth } from "../application/services/health/getHealth.js";
import { registerCustomer } from "../application/services/auth/registerCustomer.js";
import { loginCustomer } from "../application/services/auth/loginCustomer.js";
import { exchangeOAuthSessionForJwt } from "../application/services/auth/exchangeOAuthSessionForJwt.js";
import { buildStorefrontSessionResponse } from "../application/services/auth/buildStorefrontSessionResponse.js";
import { provisionCustomerForOAuthShop } from "../application/services/auth/provisionCustomerForOAuthShop.js";
import { createAssertCustomerShopAccess } from "../application/services/auth/assertCustomerShopAccess.js";
import { getCustomerProfile } from "../application/services/profile/getCustomerProfile.js";
import { updateCustomerProfile } from "../application/services/profile/updateCustomerProfile.js";
import { createUpdateStorefrontProfile } from "../application/services/profile/updateStorefrontProfile.js";
import { createCheckShopServiceArea } from "../application/services/shops/checkShopServiceArea.js";
import { createEnsureShopForCatalog } from "../application/services/catalog/ensureShopForCatalog.js";
import { createCatalogCache } from "../infra/cache/catalogCache.js";
import { createStorefrontCatalog } from "../application/services/storefront/storefrontCatalog.js";
import { createStorefrontCart } from "../application/services/storefront/storefrontCart.js";
import { createMergeGuestCart } from "../application/services/cart/mergeGuestCart.js";
import { createCheckoutStorefront } from "../application/services/checkout/checkoutStorefront.js";
import { logger } from "../config/logger.js";

export function createAppContext() {
  const catalogRepo = new CatalogRepoPg();
  const cartRepo = new CartRepoPg();
  const orderRepo = new OrderRepoPg();
  const authRepo = new CustomerAuthRepoPg();
  const shopLookupRepo = new ShopLookupRepoPg();
  const shopServiceAreaRepo = new ShopServiceAreaRepoPg();
  const ensureShopForCatalog = createEnsureShopForCatalog({ authRepo });
  const customerJwtMiddleware = createRequireCustomerJwt({
    authRepo,
    skipDbSessionCheck: env.NODE_ENV === "test"
  });
  const optionalCustomerJwt = createOptionalCustomerJwt({
    authRepo,
    skipDbSessionCheck: env.NODE_ENV === "test"
  });

  const shopResolver = createShopResolver({
    shopLookupRepo,
    storefrontRootDomain: env.STOREFRONT_ROOT_DOMAIN || null
  });

  const catalogCache = createCatalogCache({ redisUrl: env.REDIS_URL, logger });

  const storefrontCatalog = createStorefrontCatalog({
    catalogRepo,
    ensureShopForCatalog,
    catalogCache
  });

  const storefrontCart = createStorefrontCart({ cartRepo, ensureShopForCatalog });
  const mergeGuestCart = createMergeGuestCart({ cartRepo });
  const assertCustomerShopAccess = createAssertCustomerShopAccess({ authRepo });
  const updateStorefrontProfile = createUpdateStorefrontProfile({ authRepo });

  const realtime = {
    emitPickerOrderNew: () => {}
  };

  const checkoutStorefront = createCheckoutStorefront({
    cartRepo,
    orderRepo,
    authRepo,
    deliveryFeeMinor: env.STOREFRONT_DELIVERY_FEE_MINOR,
    emitOrderNew: (payload) => realtime.emitPickerOrderNew(payload)
  });

  return {
    shopLookupRepo,
    shopResolver,
    authRepo,
    cartRepo,
    orderRepo,
    getHealth: createGetHealth(),
    listCatalogItems: createListCatalogItems({ catalogRepo, ensureShopForCatalog }),
    listCategories: createListCategories({ catalogRepo, ensureShopForCatalog }),
    listProducts: createListProducts({ catalogRepo, ensureShopForCatalog }),
    searchCatalog: createSearchCatalog({ catalogRepo, ensureShopForCatalog }),
    registerCustomer: registerCustomer({ authRepo }),
    loginCustomer: loginCustomer({ authRepo }),
    exchangeOAuthSessionForJwt: exchangeOAuthSessionForJwt({ authRepo }),
    provisionCustomerForOAuthShop: provisionCustomerForOAuthShop({ authRepo }),
    buildStorefrontSessionResponse: (client, userId) => buildStorefrontSessionResponse(authRepo, client, userId),
    getCustomerProfile: getCustomerProfile({ authRepo }),
    updateCustomerProfile: updateCustomerProfile({ authRepo }),
    checkShopServiceArea: createCheckShopServiceArea({
      shopServiceAreaRepo,
      maxRadiusM: env.SERVICE_AREA_RADIUS_METERS
    }),
    requireCustomerJwt: customerJwtMiddleware(),
    optionalCustomerJwt: optionalCustomerJwt(),
    locationGuard: createLocationGuard(),
    storefrontCatalog,
    storefrontCart,
    mergeGuestCart,
    assertCustomerShopAccess,
    updateStorefrontProfile,
    checkoutStorefront,
    get emitPickerOrderNew() {
      return realtime.emitPickerOrderNew;
    },
    set emitPickerOrderNew(fn) {
      realtime.emitPickerOrderNew = fn;
    }
  };
}

