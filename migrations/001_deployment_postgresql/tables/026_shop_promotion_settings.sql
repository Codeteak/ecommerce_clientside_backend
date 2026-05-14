/*
 * shop_promotion_settings
 * -----------------------
 * Purpose:
 *   One row per shop with defaults and switches for how promotions and coupons
 *   behave. Merchants tune these once; individual promotions can override some
 *   values when needed (see promotions table).
 *
 * Relationships:
 *   shop_id  -> shops (one shop, one settings row; PK is shop_id)
 *   created_by / updated_by -> users (optional audit)
 *
 * Example usage:
 *   When checkout runs, the app reads this row to know max coupons per order,
 *   whether automatic campaigns may stack, and default overlap rules before
 *   evaluating promotions and promotion_coupons for that shop.
 */
CREATE TABLE IF NOT EXISTS shop_promotion_settings (
  -- Which shop these settings belong to. Needed so every tenant has its own policy.
  shop_id UUID PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  -- When true, automatic promotions are turned off shop-wide without deleting data.
  promotions_paused BOOLEAN NOT NULL DEFAULT false,
  -- How overlapping automatic discounts are resolved when a promotion does not set its own mode.
  default_overlap_mode TEXT NOT NULL DEFAULT 'priority'
    CHECK (default_overlap_mode IN ('priority', 'best_for_customer')),
  -- Whether a customer may apply a coupon after automatic discounts; default for new promotions.
  default_allow_coupon_after_auto BOOLEAN NOT NULL DEFAULT true,
  -- Window (days) for "new customer" coupon rules; used with promotion_coupons.new_customer_only.
  first_coupon_eligibility_days INT NOT NULL DEFAULT 30
    CHECK (first_coupon_eligibility_days >= 0 AND first_coupon_eligibility_days <= 365),
  -- Default stacking: SKU-level promos with category rules (inherits to promotions when NULL there).
  default_stack_sku_with_category BOOLEAN NOT NULL DEFAULT false,
  -- Default stacking: SKU-level with whole-cart rules.
  default_stack_sku_with_cart BOOLEAN NOT NULL DEFAULT false,
  -- Default stacking: category-level with whole-cart rules.
  default_stack_category_with_cart BOOLEAN NOT NULL DEFAULT false,
  -- Upper bound on how many different coupon codes may apply on a single order.
  max_coupons_per_order INT NOT NULL DEFAULT 1
    CHECK (max_coupons_per_order >= 1 AND max_coupons_per_order <= 10),
  -- If false, at most one automatic "campaign" discount should win (application layer enforces).
  allow_combine_auto_campaigns BOOLEAN NOT NULL DEFAULT true,
  -- When this row was created; useful for support and migrations.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- When any setting above last changed.
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Optional staff user who created the row (audit).
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Optional staff user who last updated the row (audit).
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);
