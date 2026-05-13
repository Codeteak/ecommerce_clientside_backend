CREATE TABLE IF NOT EXISTS promotion_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  code_normalized TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  min_subtotal_minor BIGINT CHECK (min_subtotal_minor IS NULL OR min_subtotal_minor >= 0),
  first_order_only BOOLEAN NOT NULL DEFAULT false,
  new_customer_only BOOLEAN NOT NULL DEFAULT false,
  max_redemptions_total INT CHECK (max_redemptions_total IS NULL OR max_redemptions_total > 0),
  max_redemptions_per_customer INT CHECK (max_redemptions_per_customer IS NULL OR max_redemptions_per_customer > 0),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT promotion_coupons_window_chk CHECK (ends_at > starts_at),
  CONSTRAINT promotion_coupons_code_len_chk CHECK (char_length(code_normalized) BETWEEN 1 AND 64)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'promotion_coupons' AND c.conname = 'promotion_coupons_shop_id_code_normalized_key'
  ) THEN
    ALTER TABLE promotion_coupons DROP CONSTRAINT promotion_coupons_shop_id_code_normalized_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_promotion_coupons_shop_code_active
  ON promotion_coupons (shop_id, code_normalized)
  WHERE is_deleted = false;
