CREATE TABLE IF NOT EXISTS promotion_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  rule_kind TEXT NOT NULL CHECK (rule_kind IN (
    'cart_percent_off',
    'cart_fixed_off',
    'cart_fixed_off_if_subtotal_above',
    'category_percent_off'
  )),
  percent_bps INT CHECK (percent_bps IS NULL OR (percent_bps >= 0 AND percent_bps <= 10000)),
  amount_minor BIGINT CHECK (amount_minor IS NULL OR amount_minor >= 0),
  min_subtotal_minor BIGINT CHECK (min_subtotal_minor IS NULL OR min_subtotal_minor >= 0),
  global_category_id UUID REFERENCES global_categories(id) ON DELETE SET NULL,
  max_discount_minor BIGINT CHECK (max_discount_minor IS NULL OR max_discount_minor >= 0),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_promotion_rules_promotion
  ON promotion_rules (shop_id, promotion_id)
  WHERE is_deleted = false;
