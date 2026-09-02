/*
 * shop_products now stores catalog fields (name, slug, category, images).
 * global_product_id is optional, so storefront queries must not INNER JOIN global_products.
 */

export const shopProductLeftJoinGlobal = `LEFT JOIN global_products gp ON gp.id = sp.global_product_id`;

export const shopProductNameSql = `COALESCE(sp.name, gp.name)`;
export const shopProductSlugSql = `COALESCE(sp.slug, gp.slug)`;
export const shopProductBaseUnitSql = `COALESCE(sp.base_unit, gp.base_unit)`;
export const shopProductUnitSizeSql = `COALESCE(sp.unit_size, gp.unit_size)`;
export const shopProductDescriptionSql = `COALESCE(sp.description, gp.description)`;
export const shopProductSeoTitleSql = `COALESCE(sp.seo_title, gp.seo_title)`;
export const shopProductSeoDescriptionSql = `COALESCE(sp.seo_description, gp.seo_description)`;
export const shopProductCategoryIdSql = `COALESCE(sp.global_category_id, gp.global_category_id)`;
export const shopProductBrandIdSql = `COALESCE(sp.global_brand_id, gp.global_brand_id)`;
export const shopProductImageUrlSql = `COALESCE(NULLIF(BTRIM(sp.image_url), ''), gp.image_url)`;
