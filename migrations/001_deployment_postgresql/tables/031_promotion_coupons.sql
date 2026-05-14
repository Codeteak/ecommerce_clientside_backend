/*
 * promotion_coupons
 * -----------------
 * Purpose:
 *   A redeemable code (normalized for case-insensitive matching) tied to a
 *   promotion and its own validity window and limits. Customers enter the code
 *   at checkout; the engine checks dates, subtotal, usage caps, and links to
 *   the parent promotion for the actual discount logic.
 *
 * Relationships:
 *   promotion_id -> promotions (discount definition / campaign)
 *   shop_id -> shops
 *   promotion_redemptions.coupon_id references rows here when an order uses a code
 *
 * Example usage:
 *   Promotion "VIP sale" has coupon code WELCOME20: code_normalized 'welcome20',
 *   max_redemptions_total for a launch cap, max_redemptions_per_customer = 1.
 */
CREATE TABLE IF NOT EXISTS promotion_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Tenant scope for RLS and coupon lookups.
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  -- Campaign whose discount rules this code unlocks.
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  -- Stored normalized (e.g. lowercased) so lookups and uniqueness are consistent.
  code_normalized TEXT NOT NULL,
  -- Coupon validity start (can differ from the parent promotion window).
  starts_at TIMESTAMPTZ NOT NULL,
  -- Coupon validity end; must be after starts_at.
  ends_at TIMESTAMPTZ NOT NULL,
  -- Minimum cart subtotal in minor units before the code applies; NULL = no minimum.
  min_subtotal_minor BIGINT CHECK (min_subtotal_minor IS NULL OR min_subtotal_minor >= 0),
  -- Restrict to customers who have never completed an order (enforced in application).
  first_order_only BOOLEAN NOT NULL DEFAULT false,
  -- Restrict to "new" accounts within shop first_coupon_eligibility_days (application).
  new_customer_only BOOLEAN NOT NULL DEFAULT false,
  -- Global cap on how many times this code may be redeemed; NULL = unlimited.
  max_redemptions_total INT CHECK (max_redemptions_total IS NULL OR max_redemptions_total > 0),
  -- Per-customer cap; NULL = unlimited per customer.
  max_redemptions_per_customer INT CHECK (max_redemptions_per_customer IS NULL OR max_redemptions_per_customer > 0),
  -- Soft retire a code without losing redemption history.
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  -- Audit trail for coupon configuration changes.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT promotion_coupons_window_chk CHECK (ends_at > starts_at),
  CONSTRAINT promotion_coupons_code_len_chk CHECK (char_length(code_normalized) BETWEEN 1 AND 64)
);

-- Migrate older installs: drop legacy unique constraint name if present so partial unique index applies.
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

-- One active code string per shop; deleted rows excluded so codes can be reused after soft-delete.
CREATE UNIQUE INDEX IF NOT EXISTS uq_promotion_coupons_shop_code_active
  ON promotion_coupons (shop_id, code_normalized)
  WHERE is_deleted = false;
