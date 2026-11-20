import {
  shopProductCategoryIdSql,
  shopProductImageUrlSql,
  shopProductLeftJoinGlobal,
  shopProductNameSql,
  shopProductSlugSql,
  shopProductStockQuantitySql,
  shopProductThumbJoinSql
} from "./shopProductCatalogSql.js";

/**
 * Newest in-stock products for many home shelves at once.
 * $1 shop id, $2 section ids, $3 category ids (paired with $2), $4 per-shelf cap.
 * Each shelf keeps its own newest rows. Pins are applied later in the service.
 */
export function buildListSellableProductsBySectionCategoriesQuery() {
  return `WITH RECURSIVE walked AS (
           SELECT i.section_id, c.id AS category_id
             FROM unnest($2::uuid[], $3::uuid[]) AS i(section_id, category_id)
             JOIN global_categories c ON c.id = i.category_id
           UNION ALL
           SELECT w.section_id, child.id
             FROM global_categories child
             JOIN walked w ON child.parent_id = w.category_id
         ),
         category_tree AS (
           SELECT DISTINCT section_id, category_id
             FROM walked
         ),
         ranked AS (
           SELECT ct.section_id,
                  sp.id,
                  ROW_NUMBER() OVER (
                    PARTITION BY ct.section_id
                    ORDER BY sp.updated_at DESC NULLS LAST, sp.id ASC
                  ) AS rn
             FROM category_tree ct
             JOIN shop_products sp
               ON sp.shop_id = $1::uuid
              AND sp.status = 'active'
              AND sp.availability = 'in_stock'
             ${shopProductLeftJoinGlobal}
            WHERE ${shopProductCategoryIdSql} = ct.category_id
         ),
         picked AS (
           SELECT section_id, id, rn
             FROM ranked
            WHERE rn <= $4::int
         )
         SELECT p.section_id,
                sp.id, ${shopProductNameSql} AS name, ${shopProductSlugSql} AS slug,
                ${shopProductCategoryIdSql} AS category_id,
                ${shopProductStockQuantitySql} AS stock_quantity,
                sp.price_minor_per_unit::text AS price_minor_per_unit,
                sp.offer_price_minor_per_unit::text AS offer_price_minor_per_unit,
                ${shopProductImageUrlSql} AS global_image_url,
                pm.id AS thumb_media_id,
                pm.storage_key AS thumb_storage_key,
                pm.content_type AS thumb_content_type
           FROM picked p
           JOIN shop_products sp
             ON sp.id = p.id
            AND sp.shop_id = $1::uuid
           ${shopProductLeftJoinGlobal}
           ${shopProductThumbJoinSql("sp")}
          ORDER BY p.section_id, p.rn`;
}
