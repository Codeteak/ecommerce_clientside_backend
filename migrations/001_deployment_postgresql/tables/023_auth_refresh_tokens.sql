/*
 * auth_refresh_tokens
 * -------------------
 * Persisted refresh JWTs (hash + jti) for rotation and revocation.
 * Legacy `customer_refresh_tokens` is renamed when present.
 */

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'customer_refresh_tokens'
  ) AND NOT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'auth_refresh_tokens'
  ) THEN
    ALTER TABLE customer_refresh_tokens RENAME TO auth_refresh_tokens;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL DEFAULT 'customer'
    CHECK (subject_type IN ('customer', 'shop_staff', 'super_admin')),
  token_hash TEXT NOT NULL,
  jti UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  replaced_by_token_hash TEXT,
  issued_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Upgrade partial / legacy tables created before subject_type and related columns.
ALTER TABLE auth_refresh_tokens ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE auth_refresh_tokens ADD COLUMN IF NOT EXISTS shop_id UUID;
ALTER TABLE auth_refresh_tokens ADD COLUMN IF NOT EXISTS subject_type TEXT DEFAULT 'customer';
UPDATE auth_refresh_tokens SET subject_type = 'customer' WHERE subject_type IS NULL;
ALTER TABLE auth_refresh_tokens ALTER COLUMN subject_type SET NOT NULL;
ALTER TABLE auth_refresh_tokens ALTER COLUMN subject_type SET DEFAULT 'customer';
ALTER TABLE auth_refresh_tokens ADD COLUMN IF NOT EXISTS jti UUID;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'auth_refresh_tokens'
       AND column_name = 'jwt_id'
  ) THEN
    UPDATE auth_refresh_tokens
       SET jti = jwt_id::uuid
     WHERE jti IS NULL
       AND jwt_id IS NOT NULL
       AND jwt_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  END IF;
END $$;
ALTER TABLE auth_refresh_tokens ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;
ALTER TABLE auth_refresh_tokens ADD COLUMN IF NOT EXISTS replaced_by_token_hash TEXT;
ALTER TABLE auth_refresh_tokens ADD COLUMN IF NOT EXISTS issued_ip TEXT;
ALTER TABLE auth_refresh_tokens ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE auth_refresh_tokens ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_refresh_tokens_subject_type_check'
  ) THEN
    ALTER TABLE auth_refresh_tokens
      ADD CONSTRAINT auth_refresh_tokens_subject_type_check
      CHECK (subject_type IN ('customer', 'shop_staff', 'super_admin'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS auth_refresh_tokens_token_hash_key
  ON auth_refresh_tokens (token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS auth_refresh_tokens_jti_key
  ON auth_refresh_tokens (jti);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user_subject
  ON auth_refresh_tokens (user_id, subject_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user_customer
  ON auth_refresh_tokens (user_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user_shop
  ON auth_refresh_tokens (user_id, shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_live
  ON auth_refresh_tokens (token_hash, expires_at DESC)
  WHERE consumed_at IS NULL;

-- Legacy installs used `jwt_id` instead of `jti`; standardize on `jti` only.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'auth_refresh_tokens'
       AND column_name = 'jwt_id'
  ) THEN
    UPDATE auth_refresh_tokens
       SET jti = jwt_id::uuid
     WHERE jti IS NULL
       AND jwt_id IS NOT NULL
       AND jwt_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    ALTER TABLE auth_refresh_tokens DROP COLUMN jwt_id;
  END IF;
END $$;
