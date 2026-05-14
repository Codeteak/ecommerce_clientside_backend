/*
 * promotion_rules
 * ---------------
 * Purpose:
 *   Stores cart-wide or category-wide discount rules for a promotion (percent
 *   or fixed amount off, optionally gated by minimum subtotal). Different
 *   rule_kind values map to different formulas in the pricing engine.
 *
 * Relationships:
 *   promotion_id -> promotions
 *   global_category_id -> global_categories (only for category_percent_off)
 *   shop_id -> shops
 *
 * Example usage:
 *   A promotion adds one row rule_kind = cart_percent_off with percent_bps = 1000
 *   (10%). Another adds category_percent_off tied to global_category_id for
 *   "Electronics -10%".
 */
CREATE TABLE IF NOT EXISTS promotion_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Tenant scope for fast filtering and RLS.
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  -- Parent campaign this rule belongs to.
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  -- Which formula to run: cart %/fixed off, thresholds, or category % off.
  rule_kind TEXT NOT NULL CHECK (rule_kind IN (
    'cart_percent_off',
    'cart_fixed_off',
    'cart_fixed_off_if_subtotal_above',
    'cart_percent_off_if_subtotal_above',
    'category_percent_off'
  )),
  -- Discount as basis points (100 = 1%, 10000 = 100%); used by percent-style kinds.
  percent_bps INT CHECK (percent_bps IS NULL OR (percent_bps >= 0 AND percent_bps <= 10000)),
  -- Fixed discount amount in minor units for fixed-off rules.
  amount_minor BIGINT CHECK (amount_minor IS NULL OR amount_minor >= 0),
  -- Cart subtotal required before "if_subtotal_above" rules apply; NULL when not used.
  min_subtotal_minor BIGINT CHECK (min_subtotal_minor IS NULL OR min_subtotal_minor >= 0),
  -- Target category for category_percent_off; NULL for pure cart rules.
  global_category_id UUID REFERENCES global_categories(id) ON DELETE SET NULL,
  -- Optional cap on how much discount this rule may give (minor units).
  max_discount_minor BIGINT CHECK (max_discount_minor IS NULL OR max_discount_minor >= 0),
  -- Soft delete so old orders still align with historical rule snapshots if needed.
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  -- Audit timestamps and users for rule changes.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Load all rules for one promotion when evaluating cart discounts.
CREATE INDEX IF NOT EXISTS idx_promotion_rules_promotion
  ON promotion_rules (shop_id, promotion_id)
  WHERE is_deleted = false;
