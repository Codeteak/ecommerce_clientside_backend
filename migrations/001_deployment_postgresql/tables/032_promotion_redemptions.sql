CREATE TABLE IF NOT EXISTS promotion_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL,
  coupon_id UUID REFERENCES promotion_coupons(id) ON DELETE SET NULL,
  discount_minor BIGINT NOT NULL CHECK (discount_minor >= 0),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT promotion_redemptions_ref_chk CHECK (promotion_id IS NOT NULL OR coupon_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_promotion_redemptions_order_coupon
  ON promotion_redemptions (order_id, coupon_id)
  WHERE coupon_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_shop_customer
  ON promotion_redemptions (shop_id, customer_id, redeemed_at DESC);

CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_order
  ON promotion_redemptions (order_id);
