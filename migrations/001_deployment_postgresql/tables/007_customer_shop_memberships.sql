CREATE TABLE IF NOT EXISTS customer_shop_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (shop_id, customer_id)
);

-- Purpose: Stores customer OTP login challenges (hashed code, TTL, attempts, single-use).
