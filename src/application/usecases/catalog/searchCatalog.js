import { requireShopId } from "./catalogShopId.js";
import { toIlikePattern } from "./catalogSearchPattern.js";
import { productsOrderByClause, categoriesOrderByClause } from "./catalogSearchOrder.js";

export function createSearchCatalog({ catalogRepo, ensureShopForCatalog }) {
  return async function searchCatalog(shopId, query) {
    const id = requireShopId(shopId);
    await ensureShopForCatalog(id);

    const categoryId = query.categoryId ?? null;
    const parentId = query.parentId ?? null;
    const qPattern = toIlikePattern(query.q ?? null);

    const result = { products: [], categories: [] };

    if (query.type === "products" || query.type === "both") {
      result.products = await catalogRepo.searchProducts(id, {
        categoryId,
        availability: query.availability ?? null,
        qPattern,
        orderBySql: productsOrderByClause(query.productSort, query.productOrder),
        limit: query.productLimit,
        offset: query.productOffset
      });
    }

    if (query.type === "categories" || query.type === "both") {
      result.categories = await catalogRepo.searchCategories(id, {
        parentId,
        qPattern,
        orderBySql: categoriesOrderByClause(query.categorySort, query.categoryOrder),
        limit: query.categoryLimit,
        offset: query.categoryOffset
      });
    }

    return result;
  };
}
