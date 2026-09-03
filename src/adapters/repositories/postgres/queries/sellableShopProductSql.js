/*
 * Shared SQL fragments for shop_products rows that are backed by global_products
 * and are eligible for cart add / checkout (purchase path).
 * Queries must alias shop_products as `sp` and global_products as `gp`.
 */

/** FROM + optional global catalog row. Shop products may stand alone. */
export const sellableShopProductJoin = `FROM shop_products sp
  LEFT JOIN global_products gp ON gp.id = sp.global_product_id`;

/** Predicates for purchase: listed for sale and treated as in stock. */
export const sellableAtPurchasePredicates = `sp.status = 'active'
  AND sp.availability = 'in_stock'`;
