CREATE TABLE IF NOT EXISTS promotion_bundle_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('same_shop_product', 'global_category')),
  shop_product_id UUID REFERENCES shop_products(id) ON DELETE CASCADE,
  global_category_id UUID REFERENCES global_categories(id) ON DELETE SET NULL,
  buy_qty INT NOT NULL CHECK (buy_qty > 0),
  get_qty INT NOT NULL CHECK (get_qty > 0),
  reward_type TEXT NOT NULL CHECK (reward_type IN ('free', 'percent_off_reward')),
  reward_percent_bps INT CHECK (reward_percent_bps IS NULL OR (reward_percent_bps >= 0 AND reward_percent_bps <= 10000)),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
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
