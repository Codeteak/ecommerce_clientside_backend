import { requireShopId, parseOptionalUuidParam } from "./catalogShopId.js";

/**
 * @param {{ catalogRepo: import("../../ports/repositories/CatalogRepo.js").CatalogRepo }} deps
 */
export function createListCategories({ catalogRepo }) {
  /**
   * @param {string|undefined} shopId
   * @param {{ parentId?: string|null }} query — omit/null/empty: root categories; UUID: children of parent
   */
  return async function listCategories(shopId, query = {}) {
    const id = requireShopId(shopId);
    const parentId = parseOptionalUuidParam(query.parentId);
    return catalogRepo.listCategories(id, { parentId });
  };
}
