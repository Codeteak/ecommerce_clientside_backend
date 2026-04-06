import { requireShopId, parseOptionalUuidParam } from "./catalogShopId.js";

export function createListCategories({ catalogRepo, ensureShopForCatalog }) {
  return async function listCategories(shopId, query = {}) {
    const id = requireShopId(shopId);
    const parentId = parseOptionalUuidParam(query.parentId);
    await ensureShopForCatalog(id);
    return catalogRepo.listCategories(id, { parentId });
  };
}
