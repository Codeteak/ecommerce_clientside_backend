/*
This file builds SQL for storefront product listing with cursor and offset pagination.
*/

import { SHOP_PRODUCT_BASELINE_UNIT_MINOR_SQL } from "../../../../application/services/catalog/catalogBaselineUnitSql.js";

/** @param {'in_stock' | 'out_of_stock' | 'unknown' | null} availability */
function availabilityPredicate(alias, availability) {
  if (!availability) return "";
  return `AND ${alias}.availability = '${availability}'`;
}

export function buildListProductsStorefrontQuery({
  shopId,
  categoryId,
  brandId,
  qPattern,
  availability,
  minPriceMinor,
  maxPriceMinor,
  limit,
  offset,
  cursorCreatedAt,
  cursorId,
  sortOrder,
  orderBySql
}) {
  const categoryAvailabilitySql = availabilityPredicate("sp2", availability);
  const values = [shopId, categoryId, brandId, qPattern, availability, minPriceMinor, maxPriceMinor, limit];
  let cursorClause = "";
  let offsetClause = "";

  if (cursorCreatedAt && cursorId) {
    values.push(cursorCreatedAt, cursorId);
    cursorClause =
      sortOrder === "asc"
        ? `AND (sp.created_at, sp.id) > ($${values.length - 1}::timestamptz, $${values.length}::uuid)`
        : `AND (sp.created_at, sp.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`;
  }

  if (Number.isInteger(offset) && offset > 0) {
    values.push(offset);
    offsetClause = `OFFSET $${values.length}`;
  }

  const text = `WITH RECURSIVE category_descendants AS (
      SELECT c.id, c.parent_id
        FROM global_categories c
       WHERE c.id = $2::uuid
      UNION ALL
      SELECT c.id, c.parent_id
        FROM global_categories c
        JOIN category_descendants cd ON c.parent_id = cd.id
    ),
    category_direct_products AS (
      SELECT EXISTS (
        SELECT 1
          FROM shop_products sp2
          JOIN global_products gp2 ON gp2.id = sp2.global_product_id
         WHERE sp2.shop_id = $1::uuid
           AND sp2.status = 'active'
           ${categoryAvailabilitySql}
           AND gp2.global_category_id = $2::uuid
      ) AS has_direct
    ),
    effective_categories AS (
      SELECT $2::uuid AS id
       WHERE $2::uuid IS NOT NULL
         AND (SELECT has_direct FROM category_direct_products)
      UNION ALL
      SELECT cd.id
        FROM category_descendants cd
       WHERE $2::uuid IS NOT NULL
         AND NOT (SELECT has_direct FROM category_direct_products)
         AND cd.id <> $2::uuid
    )
    SELECT sp.id,
          gp.global_category_id AS category_id,
          gp.name,
          gp.slug,
          gp.base_unit,
          sp.status,
          sp.availability,
          sp.price_minor_per_unit::text AS price_minor_per_unit,
          sp.offer_price_minor_per_unit::text AS offer_price_minor_per_unit,
          sp.created_at,
          sp.updated_at,
          gp.image_url AS global_image_url,
          thumb.media_asset_id AS thumb_media_id,
          thumb.storage_key AS thumb_storage_key,
          thumb.content_type AS thumb_content_type,
          pgal.product_images AS product_images,
          c.parent_id AS category_parent_id,
          c.name AS category_name,
          c.slug AS category_slug,
          cma.id AS category_image_media_id,
          cma.storage_key AS category_image_storage_key,
          cma.content_type AS category_image_content_type
     FROM shop_products sp
     JOIN global_products gp ON gp.id = sp.global_product_id
     LEFT JOIN LATERAL (
       WITH chosen_images AS (
         SELECT spi.media_asset_id, spi.sort_order
           FROM shop_product_images spi
          WHERE spi.shop_product_id = sp.id
         UNION ALL
         SELECT gpi.media_asset_id, gpi.sort_order
           FROM global_product_images gpi
          WHERE gpi.global_product_id = sp.global_product_id
            AND NOT EXISTS (
              SELECT 1
                FROM shop_product_images spi2
               WHERE spi2.shop_product_id = sp.id
            )
       )
       SELECT ci.media_asset_id, ma.storage_key, ma.content_type
         FROM chosen_images ci
         JOIN media_assets ma ON ma.id = ci.media_asset_id
        ORDER BY ci.sort_order ASC
        LIMIT 1
     ) thumb ON true
     LEFT JOIN LATERAL (
       WITH chosen_images AS (
         SELECT spi.media_asset_id, spi.sort_order
           FROM shop_product_images spi
          WHERE spi.shop_product_id = sp.id
         UNION ALL
         SELECT gpi.media_asset_id, gpi.sort_order
           FROM global_product_images gpi
          WHERE gpi.global_product_id = sp.global_product_id
            AND NOT EXISTS (
              SELECT 1
                FROM shop_product_images spi2
               WHERE spi2.shop_product_id = sp.id
            )
       )
       SELECT COALESCE(
         json_agg(
           json_build_object(
             'media_asset_id', ci.media_asset_id,
             'sort_order', ci.sort_order,
             'storage_key', ma.storage_key,
             'content_type', ma.content_type
           )
           ORDER BY ci.sort_order ASC
         ),
         '[]'::json
       ) AS product_images
       FROM (
         SELECT ci.media_asset_id, ci.sort_order
           FROM chosen_images ci
          ORDER BY ci.sort_order ASC
          LIMIT 1
       ) ci
       JOIN media_assets ma ON ma.id = ci.media_asset_id
     ) pgal ON true
     LEFT JOIN global_categories c ON c.id = gp.global_category_id
     LEFT JOIN LATERAL (
       SELECT gci.media_asset_id
         FROM global_category_images gci
        WHERE gci.global_category_id = c.id
        ORDER BY gci.sort_order ASC, gci.created_at ASC
        LIMIT 1
     ) cimg ON true
     LEFT JOIN media_assets cma ON cma.id = cimg.media_asset_id
    WHERE sp.shop_id = $1::uuid
      AND sp.status = 'active'
      AND (
        $2::uuid IS NULL
        OR gp.global_category_id IN (SELECT id FROM effective_categories)
      )
      AND ($3::uuid IS NULL OR gp.global_brand_id = $3)
      AND ($4::text IS NULL OR gp.name ILIKE $4 ESCAPE '\\' OR gp.slug ILIKE $4 ESCAPE '\\')
      AND ($5::text IS NULL OR sp.availability = $5)
      AND ($6::bigint IS NULL OR (${SHOP_PRODUCT_BASELINE_UNIT_MINOR_SQL}) >= $6)
      AND ($7::bigint IS NULL OR (${SHOP_PRODUCT_BASELINE_UNIT_MINOR_SQL}) <= $7)
      ${cursorClause}
    ORDER BY ${orderBySql}
    LIMIT $8
    ${offsetClause}`;

  return { text, values };
}
