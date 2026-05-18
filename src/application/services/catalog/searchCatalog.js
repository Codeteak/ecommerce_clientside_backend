import { env } from "../../../config/env.js";
import { requireShopId } from "./catalogShopId.js";
import { resolveCatalogSearchPattern } from "./catalogSearchPattern.js";
import { productsOrderByClause, categoriesOrderByClause } from "./catalogSearchOrder.js";

export function createSearchCatalog({ catalogRepo, ensureShopForCatalog }) {
  return async function searchCatalog(shopId, query) {
    const id = requireShopId(shopId);
    await ensureShopForCatalog(id);

    const categoryId = query.categoryId ?? null;
    const parentId = query.parentId ?? null;
    const searchMode = query.searchMode ?? "contains";
    const qRaw =
      query.q != null && String(query.q).trim() !== "" ? String(query.q).trim() : null;
    const qPattern = resolveCatalogSearchPattern(query.q ?? null, searchMode);
    const useTrgm = Boolean(env.SEARCH_USE_TRGM && searchMode !== "prefix" && qRaw);

    const result = { products: [], categories: [] };

    if (query.type === "products" || query.type === "both") {
      result.products = await catalogRepo.searchProducts(id, {
        categoryId,
        availability: query.availability ?? null,
        qPattern: useTrgm ? null : qPattern,
        qRaw: useTrgm ? qRaw : null,
        useTrgm,
        orderBySql: productsOrderByClause(query.productSort, query.productOrder),
        limit: query.productLimit,
        offset: query.productOffset
      });
    }

    if (query.type === "categories" || query.type === "both") {
      result.categories = await catalogRepo.searchCategories(id, {
        parentId,
        qPattern: useTrgm ? null : qPattern,
        qRaw: useTrgm ? qRaw : null,
        useTrgm,
        orderBySql: categoriesOrderByClause(query.categorySort, query.categoryOrder),
        limit: query.categoryLimit,
        offset: query.categoryOffset
      });
    }

    return result;
  };
}
