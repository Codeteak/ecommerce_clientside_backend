CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  priority SMALLINT NOT NULL DEFAULT 100,
  overlap_mode TEXT
    CHECK (overlap_mode IS NULL OR overlap_mode IN ('priority', 'best_for_customer')),
  allow_coupon_after_auto BOOLEAN,
  stack_sku_with_category BOOLEAN,
  stack_sku_with_cart BOOLEAN,
  stack_category_with_cart BOOLEAN,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT promotions_window_chk CHECK (ends_at > starts_at),
  CONSTRAINT promotions_name_len_chk CHECK (char_length(name) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS idx_promotions_shop_active_window
  ON promotions (shop_id, starts_at, ends_at)
  WHERE is_deleted = false AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_promotions_shop_list
  ON promotions (shop_id, is_deleted, created_at DESC);
