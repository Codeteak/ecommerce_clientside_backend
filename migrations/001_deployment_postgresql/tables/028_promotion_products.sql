/*
 * promotion_products
 * ------------------
 * Purpose:
 *   Links a promotion to specific catalog SKUs (shop_products) and stores the
 *   promotional unit price in minor currency units (e.g. cents). Used for
 *   "sale price" style merchandising inside a campaign.
 *
 * Relationships:
 *   promotion_id -> promotions (campaign)
 *   shop_product_id -> shop_products (which variant/SKU is on sale)
 *   shop_id -> shops (denormalized for tenant queries and RLS)
 *
 * Example usage:
 *   "Black Friday" promotion includes rows for each discounted SKU with
 *   promo_price_minor_per_unit; checkout compares cart lines to these prices.
 */
CREATE TABLE IF NOT EXISTS promotion_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Redundant shop key: keeps tenant filters fast and aligns with RLS patterns.
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  -- Parent campaign this sale price belongs to.
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  -- The catalog line item receiving the promotional price.
  shop_product_id UUID NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  -- Sale amount per unit in smallest currency unit; must be non-negative.
  promo_price_minor_per_unit BIGINT NOT NULL CHECK (promo_price_minor_per_unit >= 0),
  -- Soft delete so historical orders and reports still make sense.
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  -- Audit: when this sale-price row was created.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Audit: last edit time for price or flags.
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- One sale price row per product per promotion (no duplicate SKUs in same campaign).
  UNIQUE (promotion_id, shop_product_id)
);

-- Find active promo prices for a given product across campaigns.
CREATE INDEX IF NOT EXISTS idx_promotion_products_shop_product
  ON promotion_products (shop_id, shop_product_id)
  WHERE is_deleted = false;

-- List all SKUs on sale under one promotion.
CREATE INDEX IF NOT EXISTS idx_promotion_products_promotion
  ON promotion_products (shop_id, promotion_id)
  WHERE is_deleted = false;
