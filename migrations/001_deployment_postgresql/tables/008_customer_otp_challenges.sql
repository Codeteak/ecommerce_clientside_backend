CREATE TABLE IF NOT EXISTS customer_otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_otp_challenges_phone_format_chk') THEN
    ALTER TABLE customer_otp_challenges
      ADD CONSTRAINT customer_otp_challenges_phone_format_chk
      CHECK (phone ~ '^[0-9+][0-9]{7,31}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_otp_challenges_attempts_chk') THEN
    ALTER TABLE customer_otp_challenges
      ADD CONSTRAINT customer_otp_challenges_attempts_chk
      CHECK (attempts >= 0 AND attempts <= 20);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_otp_challenges_lookup
  ON customer_otp_challenges (phone, shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_otp_challenges_active
  ON customer_otp_challenges (phone, shop_id, expires_at DESC)
  WHERE consumed_at IS NULL;

-- Purpose: Stores customer email OTP login challenges (hashed code, TTL, attempts, single-use).
