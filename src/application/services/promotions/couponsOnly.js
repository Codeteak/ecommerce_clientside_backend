/**
 * Pause product-sale overlays and Buy X Get Y.
 * Coupons stay active. Automatic cart discounts follow ALLOW_AUTO_CART.
 * Set COUPONS_ONLY to false to restore product sales and Buy X Get Y.
 */
export const COUPONS_ONLY = true;

/** When true, load and apply automatic cart rules even while COUPONS_ONLY pauses SKU/BXGY. */
export const ALLOW_AUTO_CART = true;
