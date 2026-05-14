/*
 * promotion_redemptions
 * ---------------------
 * Purpose:
 *   Immutable-style ledger of promotion or coupon value applied on a completed
 *   (or pending) order: how much was discounted and which promotion/coupon
 *   caused it. Used for analytics, customer limits, and reconciliation.
 *
 * Relationships:
 *   order_id -> orders (which checkout received the discount)
 *   shop_id -> shops
 *   promotion_id -> promotions (optional: automatic campaign)
 *   coupon_id -> promotion_coupons (optional: customer-entered code)
 *   At least one of promotion_id or coupon_id must be set (check constraint).
 *
 * Example usage:
 *   On order placement, insert one row with coupon_id set and discount_minor
 *   for the code's share; another row may exist for a stackable auto promotion
 *   with promotion_id set and coupon_id NULL.
 */
CREATE TABLE IF NOT EXISTS promotion_redemptions (
  -- Surrogate key for each discount slice applied on an order.
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  -- Order that received this slice of discount (cascade removes rows if order is deleted).
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- Opaque customer identifier used for per-customer coupon limits and reporting.
  customer_id TEXT NOT NULL,
  -- Campaign that contributed discount; NULL when this row is coupon-only.
  promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL,
  -- Specific code redeemed; NULL when this row records automatic promo only.
  coupon_id UUID REFERENCES promotion_coupons(id) ON DELETE SET NULL,
  -- Actual discount attributed to this redemption in minor currency units.
  discount_minor BIGINT NOT NULL CHECK (discount_minor >= 0),
  -- When the discount was recorded (usually order time); supports time-based reports.
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT promotion_redemptions_ref_chk CHECK (promotion_id IS NOT NULL OR coupon_id IS NOT NULL)
);

-- Prevents double-applying the same coupon on the same order.
CREATE UNIQUE INDEX IF NOT EXISTS uq_promotion_redemptions_order_coupon
  ON promotion_redemptions (order_id, coupon_id)
  WHERE coupon_id IS NOT NULL;

-- Supports "list my redemptions" and fraud/limit checks by customer.
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_shop_customer
  ON promotion_redemptions (shop_id, customer_id, redeemed_at DESC);

-- Fast lookup of all discount rows for one order.
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_order
  ON promotion_redemptions (order_id);
