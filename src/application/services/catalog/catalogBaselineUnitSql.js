/**
 * SQL fragment: catalog baseline unit price in minor currency (integer).
 * Must stay in sync with `baselineUnitMinorFromCatalog` in
 * `resolveStorefrontSkuUnitPrices.js` (shop_products alias `sp`).
 */
export const SHOP_PRODUCT_BASELINE_UNIT_MINOR_SQL =
  "CASE WHEN sp.offer_price_minor_per_unit IS NOT NULL AND sp.offer_price_minor_per_unit < sp.price_minor_per_unit THEN sp.offer_price_minor_per_unit ELSE sp.price_minor_per_unit END";
