import { requireShopId, parseOptionalUuidParam } from "./catalogShopId.js";

export function createListProducts({ catalogRepo, ensureShopForCatalog }) {
  return async function listProducts(shopId, query = {}) {
    const id = requireShopId(shopId);
    const categoryId = parseOptionalUuidParam(query.categoryId);
    await ensureShopForCatalog(id);
    return catalogRepo.listProducts(id, { categoryId });
  };
}
