import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { shopAllowsCustomers } from "../auth/shopPolicy.js";

/**
 * @param {{
 *   shopResolveCache?: {
 *     ensureShopAllowsCustomers: (shopId: string) => Promise<object | null>
 *   },
 *   authRepo?: import("../../ports/repositories/CustomerAuthRepo.js").CustomerAuthRepo,
 *   pool?: import("pg").Pool
 * }} deps
 */
export function createEnsureShopForCatalog({ shopResolveCache, authRepo, pool }) {
  return async function ensureShopForCatalog(shopId) {
    let shop = null;
    if (shopResolveCache) {
      shop = await shopResolveCache.ensureShopAllowsCustomers(shopId);
    } else if (authRepo && pool) {
      const client = await pool.connect();
      try {
        shop = await authRepo.getShopById(client, shopId);
      } finally {
        client.release();
      }
    }
    if (!shop) {
      throw new NotFoundError("Shop not found");
    }
    if (!shopAllowsCustomers(shop)) {
      throw new ValidationError("Shop is not available");
    }
  };
}
