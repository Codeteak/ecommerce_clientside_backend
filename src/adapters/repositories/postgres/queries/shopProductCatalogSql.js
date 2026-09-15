/*
 * shop_products now stores catalog fields (name, slug, category, images).
 * global_product_id is optional, so storefront queries must not INNER JOIN global_products.
 */

export const shopProductLeftJoinGlobal = `LEFT JOIN global_products gp ON gp.id = sp.global_product_id`;

export const shopProductNameSql = `COALESCE(sp.name, gp.name)`;
export const shopProductSlugSql = `COALESCE(sp.slug, gp.slug)`;
export const shopProductBaseUnitSql = `COALESCE(sp.base_unit, gp.base_unit)`;
export const shopProductUnitSizeSql = `COALESCE(sp.unit_size, gp.unit_size)`;
export const shopProductSoldByWeightSql = `COALESCE(sp.sold_by_weight, false)`;
export const shopProductDescriptionSql = `COALESCE(sp.description, gp.description)`;
export const shopProductSeoTitleSql = `COALESCE(sp.seo_title, gp.seo_title)`;
export const shopProductSeoDescriptionSql = `COALESCE(sp.seo_description, gp.seo_description)`;
export const shopProductCategoryIdSql = `COALESCE(sp.global_category_id, gp.global_category_id)`;
export const shopProductBrandIdSql = `COALESCE(sp.global_brand_id, gp.global_brand_id)`;
export const shopProductImageUrlSql = `COALESCE(NULLIF(BTRIM(sp.image_url), ''), gp.image_url)`;

/**
 * First gallery image for a shop_products row alias (shop images, else global).
 * Adds `${mediaAlias}.storage_key` — resolve with toPublicMediaUrl in JS.
 *
 * @param {string} spAlias e.g. "sp" or "reward_sp"
 * @param {string} [mediaAlias="pm"]
 */
export function shopProductThumbJoinSql(spAlias, mediaAlias = "pm") {
  const a = String(spAlias || "sp").replace(/[^a-zA-Z0-9_]/g, "") || "sp";
  const m = String(mediaAlias || "pm").replace(/[^a-zA-Z0-9_]/g, "") || "pm";
  return `LEFT JOIN LATERAL (
             WITH chosen_images AS (
               SELECT spi.media_asset_id, spi.sort_order
                 FROM shop_product_images spi
                WHERE spi.shop_product_id = ${a}.id
               UNION ALL
               SELECT gpi.media_asset_id, gpi.sort_order
                 FROM global_product_images gpi
                WHERE gpi.global_product_id = ${a}.global_product_id
                  AND NOT EXISTS (
                    SELECT 1 FROM shop_product_images spi2 WHERE spi2.shop_product_id = ${a}.id
                  )
             )
             SELECT ci.media_asset_id
               FROM chosen_images ci
              ORDER BY ci.sort_order ASC
              LIMIT 1
           ) ${a}_pimg ON true
           LEFT JOIN media_assets ${m} ON ${m}.id = ${a}_pimg.media_asset_id`;
}
