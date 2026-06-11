/**
 * Category image resolution: global_category_images first, then shop_category_images
 * for private shop-owned categories (matches app.find_fallback_media_asset_id_by_slug).
 */

export function categoryImageLateralJoinSql({
  categoryAlias = "c",
  shopParam = "$1::uuid",
  lateralAlias = "img",
  mediaAlias = "ma"
} = {}) {
  return `LEFT JOIN LATERAL (
             SELECT x.media_asset_id
               FROM (
                 SELECT gci.media_asset_id, gci.sort_order, gci.created_at, 0 AS pri
                   FROM global_category_images gci
                  WHERE gci.global_category_id = ${categoryAlias}.id

                 UNION ALL

                 SELECT sci.media_asset_id, sci.sort_order, sci.created_at, 1 AS pri
                   FROM shop_category_images sci
                  WHERE sci.global_category_id = ${categoryAlias}.id
                    AND sci.shop_id = ${shopParam}
                    AND ${categoryAlias}.scope = 'private'
                    AND ${categoryAlias}.owner_shop_id = ${shopParam}
               ) x
              ORDER BY x.pri ASC, x.sort_order ASC, x.created_at ASC
              LIMIT 1
           ) ${lateralAlias} ON true
           LEFT JOIN media_assets ${mediaAlias} ON ${mediaAlias}.id = ${lateralAlias}.media_asset_id`;
}
