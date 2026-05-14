/*
 * promotion_bundle_rules
 * ----------------------
 * Purpose:
 *   "Buy N, get M" style deals: buy_qty units from a scope (one SKU or one
 *   global category), get get_qty units rewarded (free or discounted). Used
 *   for bundles, BOGO, and category-wide mix-and-match offers.
 *
 * Relationships:
 *   promotion_id -> promotions
 *   shop_product_id -> shop_products (when scope is same_shop_product)
 *   global_category_id -> global_categories (when scope is global_category)
 *   shop_id -> shops
 *
 * Example usage:
 *   "Buy 2 shirts from category X, get 1 at 50% off" uses scope global_category,
 *   buy_qty 2, get_qty 1, reward_type percent_off_reward with reward_percent_bps.
 */
CREATE TABLE IF NOT EXISTS promotion_bundle_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  -- Whether the "buy" pool is a single SKU or any line in a global category.
  scope TEXT NOT NULL CHECK (scope IN ('same_shop_product', 'global_category')),
  -- Set when scope is same_shop_product; identifies the product line for the bundle.
  shop_product_id UUID REFERENCES shop_products(id) ON DELETE CASCADE,
  -- Set when scope is global_category; identifies the category pool.
  global_category_id UUID REFERENCES global_categories(id) ON DELETE SET NULL,
  -- How many qualifying units the customer must buy.
  buy_qty INT NOT NULL CHECK (buy_qty > 0),
  -- How many reward units they receive when the buy threshold is met.
  get_qty INT NOT NULL CHECK (get_qty > 0),
  -- free = reward lines at zero; percent_off_reward = discount on reward lines.
  reward_type TEXT NOT NULL CHECK (reward_type IN ('free', 'percent_off_reward')),
  -- For percent_off_reward: discount on rewarded units, in basis points (0–10000).
  reward_percent_bps INT CHECK (reward_percent_bps IS NULL OR (reward_percent_bps >= 0 AND reward_percent_bps <= 10000)),
  -- Soft delete so bundle definitions can be retired without breaking past orders.
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  -- Audit trail for bundle rule edits.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT promotion_bundle_scope_chk CHECK (
    (scope = 'same_shop_product' AND shop_product_id IS NOT NULL AND global_category_id IS NULL)
    OR (scope = 'global_category' AND global_category_id IS NOT NULL AND shop_product_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_promotion_bundle_rules_promotion
  ON promotion_bundle_rules (shop_id, promotion_id)
  WHERE is_deleted = false;
