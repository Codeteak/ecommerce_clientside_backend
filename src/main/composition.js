import { CatalogRepoPg } from "../adapters/repositories/postgres/CatalogRepoPg.js";
import { CustomerAuthRepoPg } from "../adapters/repositories/postgres/CustomerAuthRepoPg.js";
import { ShopServiceAreaRepoPg } from "../adapters/repositories/postgres/ShopServiceAreaRepoPg.js";
import { env } from "../config/env.js";
import { createListCatalogItems } from "../application/usecases/catalog/listCatalogItems.js";
import { createListCategories } from "../application/usecases/catalog/listCategories.js";
import { createListProducts } from "../application/usecases/catalog/listProducts.js";
import { createSearchCatalog } from "../application/usecases/catalog/searchCatalog.js";
import { createGetHealth } from "../application/usecases/health/getHealth.js";
import { registerCustomer } from "../application/usecases/auth/registerCustomer.js";
import { loginCustomer } from "../application/usecases/auth/loginCustomer.js";
import { exchangeOAuthSessionForJwt } from "../application/usecases/auth/exchangeOAuthSessionForJwt.js";
import { buildStorefrontSessionResponse } from "../application/usecases/auth/buildStorefrontSessionResponse.js";
import { provisionCustomerForOAuthShop } from "../application/usecases/auth/provisionCustomerForOAuthShop.js";
import { getCustomerProfile } from "../application/usecases/profile/getCustomerProfile.js";
import { updateCustomerProfile } from "../application/usecases/profile/updateCustomerProfile.js";
import { createCheckShopServiceArea } from "../application/usecases/shops/checkShopServiceArea.js";
import { createEnsureShopForCatalog } from "../application/usecases/catalog/ensureShopForCatalog.js";
import { createRequireCustomerJwt } from "../interface/http/middleware/requireCustomerJwt.js";

export function createAppContext() {
  const catalogRepo = new CatalogRepoPg();
  const customerAuthRepo = new CustomerAuthRepoPg();
  const shopServiceAreaRepo = new ShopServiceAreaRepoPg();
  const ensureShopForCatalog = createEnsureShopForCatalog({ authRepo: customerAuthRepo });
  const customerJwtMiddleware = createRequireCustomerJwt({
    authRepo: customerAuthRepo,
    skipDbSessionCheck: env.NODE_ENV === "test"
  });

  return {
    getHealth: createGetHealth(),
    listCatalogItems: createListCatalogItems({ catalogRepo, ensureShopForCatalog }),
    listCategories: createListCategories({ catalogRepo, ensureShopForCatalog }),
    listProducts: createListProducts({ catalogRepo, ensureShopForCatalog }),
    searchCatalog: createSearchCatalog({ catalogRepo, ensureShopForCatalog }),
    registerCustomer: registerCustomer({ authRepo: customerAuthRepo }),
    loginCustomer: loginCustomer({ authRepo: customerAuthRepo }),
    exchangeOAuthSessionForJwt: exchangeOAuthSessionForJwt({ authRepo: customerAuthRepo }),
    provisionCustomerForOAuthShop: provisionCustomerForOAuthShop({ authRepo: customerAuthRepo }),
    buildStorefrontSessionResponse: (client, userId) =>
      buildStorefrontSessionResponse(customerAuthRepo, client, userId),
    getCustomerProfile: getCustomerProfile({ authRepo: customerAuthRepo }),
    updateCustomerProfile: updateCustomerProfile({ authRepo: customerAuthRepo }),
    checkShopServiceArea: createCheckShopServiceArea({
      shopServiceAreaRepo,
      maxRadiusM: env.SERVICE_AREA_RADIUS_METERS
    }),
    requireCustomerJwt: customerJwtMiddleware()
  };
}

/** @typedef {ReturnType<typeof createAppContext>} AppContext */
