/**
 * @param {{ catalogRepo: import("../../ports/repositories/CatalogRepo.js").CatalogRepo }} deps
 */
export function createListCatalogItems({ catalogRepo }) {
  return async function listCatalogItems() {
    return catalogRepo.list();
  };
}
