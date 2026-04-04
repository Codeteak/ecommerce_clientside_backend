import { requireShopId } from "./catalogShopId.js";

/**
 * Backward-compatible alias: lists active products (same as listProducts without category filter).
 * @param {{ catalogRepo: import("../../ports/repositories/CatalogRepo.js").CatalogRepo }} deps
 */
export function createListCatalogItems({ catalogRepo }) {
  return async function listCatalogItems(shopId) {
    const id = requireShopId(shopId);
    return catalogRepo.listProducts(id, {});
  };
}
