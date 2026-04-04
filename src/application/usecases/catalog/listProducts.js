import { requireShopId, parseOptionalUuidParam } from "./catalogShopId.js";

/**
 * @param {{ catalogRepo: import("../../ports/repositories/CatalogRepo.js").CatalogRepo }} deps
 */
export function createListProducts({ catalogRepo }) {
  /**
   * @param {string|undefined} shopId
   * @param {{ categoryId?: string|null }} query
   */
  return async function listProducts(shopId, query = {}) {
    const id = requireShopId(shopId);
    const categoryId = parseOptionalUuidParam(query.categoryId);
    return catalogRepo.listProducts(id, { categoryId });
  };
}
