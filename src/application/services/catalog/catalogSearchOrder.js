import { SHOP_PRODUCT_BASELINE_UNIT_MINOR_SQL } from "./catalogBaselineUnitSql.js";

export function productsOrderByClause(sort, order) {
  const dir = order === "desc" ? "DESC" : "ASC";
  switch (sort) {
    case "price":
      return `price_minor_per_unit ${dir}, name ASC`;
    case "created_at":
      return `created_at ${dir}, name ASC`;
    case "availability":
      return `availability ${dir}, name ASC`;
    case "name":
    default:
      return `name ${dir}`;
  }
}

export function categoriesOrderByClause(sort, order) {
  const dir = order === "desc" ? "DESC" : "ASC";
  switch (sort) {
    case "name":
      return `name ${dir}`;
    case "created_at":
      return `created_at ${dir}, sort_order ASC, name ASC`;
    case "sort_order":
    default:
      return `sort_order ${dir}, name ASC`;
  }
}

export function storefrontProductsOrderByClause(sortBy, sortOrder) {
  const dir = sortOrder === "asc" ? "ASC" : "DESC";
  switch (sortBy) {
    case "price":
      return `${SHOP_PRODUCT_BASELINE_UNIT_MINOR_SQL} ${dir}, gp.name ASC, sp.id ASC`;
    case "name":
      return `gp.name ${dir}, sp.id ASC`;
    case "created_at":
    default:
      return `sp.created_at ${dir}, sp.id ${dir}`;
  }
}
