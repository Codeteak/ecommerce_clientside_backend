/*
 * promotions
 * ----------
 * Purpose:
 *   A promotion is a time-bounded campaign for a shop: a container for rules,
 *   product prices, bundle deals, and optional coupon codes. Checkout and
 *   admin UIs list and evaluate rows here plus child tables.
 *
 * Relationships:
 *   shop_id -> shops
 *   Child tables: promotion_products, promotion_rules, promotion_bundle_rules,
 *                 promotion_coupons; promotion_redemptions references a promotion
 *                 when recording automatic or mixed discounts on orders.
 *   Nullable columns mirror shop_promotion_settings for per-campaign overrides.
 *
 * Example usage:
 *   "Summer sale" is one row (active, date range, priority). Linked
 *   promotion_products rows mark sale prices; promotion_rules add 10% off cart;
 *   promotion_coupons attaches code SUMMER10 for the same window.
 */
CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Tenant scope; every query filters by shop.
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  -- Human-readable label for merchants and internal tools (1–200 chars).
  name TEXT NOT NULL,
  -- Lifecycle: draft (editing), active (can apply), paused (temporarily off).
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused')),
  -- When the campaign window opens (inclusive for eligibility logic).
  starts_at TIMESTAMPTZ NOT NULL,
  -- When the campaign window closes; must be after starts_at.
  ends_at TIMESTAMPTZ NOT NULL,
  -- Lower number = higher priority when overlap_mode is priority; breaks ties between campaigns.
  priority SMALLINT NOT NULL DEFAULT 100,
  -- Override shop default for how overlapping automatic discounts are chosen; NULL = use shop default.
  overlap_mode TEXT
    CHECK (overlap_mode IS NULL OR overlap_mode IN ('priority', 'best_for_customer')),
  -- Override shop default: allow coupon after automatic discounts for this campaign only.
  allow_coupon_after_auto BOOLEAN,
  -- Per-campaign stacking overrides; NULL means inherit from shop_promotion_settings defaults.
  stack_sku_with_category BOOLEAN,
  stack_sku_with_cart BOOLEAN,
  stack_category_with_cart BOOLEAN,
  -- Soft delete: keeps history and foreign keys valid while hiding from normal lists.
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  -- Timestamp of soft delete; NULL while the promotion is visible.
  deleted_at TIMESTAMPTZ,
  -- Record creation time for auditing and default sort in admin lists.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Last modification time; updated whenever campaign fields change.
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Optional staff user who created the promotion.
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Optional staff user who last edited the promotion.
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Who soft-deleted the campaign, if applicable.
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT promotions_window_chk CHECK (ends_at > starts_at),
  CONSTRAINT promotions_name_len_chk CHECK (char_length(name) BETWEEN 1 AND 200)
);

-- Speeds storefront/admin queries for "active promos in this date range" per shop.
CREATE INDEX IF NOT EXISTS idx_promotions_shop_active_window
  ON promotions (shop_id, starts_at, ends_at)
  WHERE is_deleted = false AND status = 'active';

-- Supports paginated promotion lists ordered by created_at.
CREATE INDEX IF NOT EXISTS idx_promotions_shop_list
  ON promotions (shop_id, is_deleted, created_at DESC);
