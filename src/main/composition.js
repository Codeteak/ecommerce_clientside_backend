import { CatalogRepoMemory } from "../adapters/repositories/memory/CatalogRepoMemory.js";
import { createListCatalogItems } from "../application/usecases/catalog/listCatalogItems.js";
import { createGetHealth } from "../application/usecases/health/getHealth.js";

/**
 * Composition root: wire adapters → use cases → handlers.
 * Add new repositories here and pass them into use-case factories.
 */
export function createAppContext() {
  const catalogRepo = new CatalogRepoMemory();

  return {
    getHealth: createGetHealth(),
    listCatalogItems: createListCatalogItems({ catalogRepo })
  };
}

/** @typedef {ReturnType<typeof createAppContext>} AppContext */
