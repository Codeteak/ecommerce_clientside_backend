import { requireShopId } from "./catalogShopId.js";

export function createListCatalogItems({ catalogRepo, ensureShopForCatalog }) {
  return async function listCatalogItems(shopId) {
    const id = requireShopId(shopId);
    await ensureShopForCatalog(id);
    return catalogRepo.listProducts(id, {});
  };
}
