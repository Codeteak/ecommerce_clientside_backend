CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL DEFAULT 'customer'
    CHECK (subject_type IN ('customer', 'shop_staff', 'super_admin')),
  token_hash TEXT NOT NULL UNIQUE,
  jti UUID NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  replaced_by_token_hash TEXT,
  issued_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user_subject
  ON auth_refresh_tokens (user_id, subject_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user_customer
  ON auth_refresh_tokens (user_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user_shop
  ON auth_refresh_tokens (user_id, shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_live
  ON auth_refresh_tokens (token_hash, expires_at DESC)
  WHERE consumed_at IS NULL;
