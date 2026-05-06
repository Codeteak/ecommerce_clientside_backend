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
      return `COALESCE(NULLIF(offer_price_minor_per_unit, '')::bigint, 0) ${dir}, name ASC, id ASC`;
    case "name":
      return `name ${dir}, id ASC`;
    case "created_at":
    default:
      return `created_at ${dir}, id ${dir}`;
  }
}
