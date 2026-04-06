import { CatalogRepoPg } from "../adapters/repositories/postgres/CatalogRepoPg.js";
import { CustomerAuthRepoPg } from "../adapters/repositories/postgres/CustomerAuthRepoPg.js";
import { createListCatalogItems } from "../application/usecases/catalog/listCatalogItems.js";
import { createListCategories } from "../application/usecases/catalog/listCategories.js";
import { createListProducts } from "../application/usecases/catalog/listProducts.js";
import { createGetHealth } from "../application/usecases/health/getHealth.js";
import { registerCustomer } from "../application/usecases/auth/registerCustomer.js";
import { loginCustomer } from "../application/usecases/auth/loginCustomer.js";
import { exchangeOAuthSessionForJwt } from "../application/usecases/auth/exchangeOAuthSessionForJwt.js";
import { auth } from "../infra/auth/betterAuth.js";

/**
 * Composition root: wire adapters → use cases → handlers.
 * Add new repositories here and pass them into use-case factories.
 */
export function createAppContext() {
  const catalogRepo = new CatalogRepoPg();
  const customerAuthRepo = new CustomerAuthRepoPg();

  return {
    auth,
    getHealth: createGetHealth(),
    listCatalogItems: createListCatalogItems({ catalogRepo }),
    listCategories: createListCategories({ catalogRepo }),
    listProducts: createListProducts({ catalogRepo }),
    registerCustomer: registerCustomer({ authRepo: customerAuthRepo }),
    loginCustomer: loginCustomer({ authRepo: customerAuthRepo }),
    exchangeOAuthSessionForJwt: exchangeOAuthSessionForJwt({ authRepo: customerAuthRepo })
  };
}

/** @typedef {ReturnType<typeof createAppContext>} AppContext */
