CREATE TABLE IF NOT EXISTS shop_promotion_settings (
  shop_id UUID PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  promotions_paused BOOLEAN NOT NULL DEFAULT false,
  default_overlap_mode TEXT NOT NULL DEFAULT 'priority'
    CHECK (default_overlap_mode IN ('priority', 'best_for_customer')),
  default_allow_coupon_after_auto BOOLEAN NOT NULL DEFAULT true,
  first_coupon_eligibility_days INT NOT NULL DEFAULT 30
    CHECK (first_coupon_eligibility_days >= 0 AND first_coupon_eligibility_days <= 365),
  default_stack_sku_with_category BOOLEAN NOT NULL DEFAULT false,
  default_stack_sku_with_cart BOOLEAN NOT NULL DEFAULT false,
  default_stack_category_with_cart BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);
