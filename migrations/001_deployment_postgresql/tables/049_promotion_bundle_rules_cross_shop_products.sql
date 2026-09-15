/*
 * 049_promotion_bundle_rules_cross_shop_products.sql
 * -------------------------------------------------
 * Adds buy-this-get-that (cross_shop_products) support to promotion_bundle_rules.
 * Idempotent for environments that already applied columns via runtime ALTER.
 */

ALTER TABLE promotion_bundle_rules
  DROP CONSTRAINT IF EXISTS promotion_bundle_rules_scope_check;

ALTER TABLE promotion_bundle_rules
  DROP CONSTRAINT IF EXISTS promotion_bundle_scope_chk;

ALTER TABLE promotion_bundle_rules
  ADD COLUMN IF NOT EXISTS buy_shop_product_id UUID REFERENCES shop_products(id) ON DELETE CASCADE;

ALTER TABLE promotion_bundle_rules
  ADD COLUMN IF NOT EXISTS reward_shop_product_id UUID REFERENCES shop_products(id) ON DELETE CASCADE;

ALTER TABLE promotion_bundle_rules
  ADD CONSTRAINT promotion_bundle_rules_scope_check
  CHECK (scope IN ('same_shop_product', 'global_category', 'cross_shop_products'));

ALTER TABLE promotion_bundle_rules
  ADD CONSTRAINT promotion_bundle_scope_chk
  CHECK (
    (scope = 'same_shop_product'
      AND shop_product_id IS NOT NULL
      AND global_category_id IS NULL
      AND buy_shop_product_id IS NULL
      AND reward_shop_product_id IS NULL)
    OR (scope = 'global_category'
      AND global_category_id IS NOT NULL
      AND shop_product_id IS NULL
      AND buy_shop_product_id IS NULL
      AND reward_shop_product_id IS NULL)
    OR (scope = 'cross_shop_products'
      AND buy_shop_product_id IS NOT NULL
      AND reward_shop_product_id IS NOT NULL
      AND buy_shop_product_id <> reward_shop_product_id
      AND shop_product_id IS NULL
      AND global_category_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_promotion_bundle_rules_cross_buy
  ON promotion_bundle_rules (shop_id, buy_shop_product_id)
  WHERE is_deleted = false AND scope = 'cross_shop_products';

CREATE INDEX IF NOT EXISTS idx_promotion_bundle_rules_cross_reward
  ON promotion_bundle_rules (shop_id, reward_shop_product_id)
  WHERE is_deleted = false AND scope = 'cross_shop_products';
