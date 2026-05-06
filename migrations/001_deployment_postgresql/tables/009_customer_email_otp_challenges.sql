CREATE TABLE IF NOT EXISTS customer_email_otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_email_otp_challenges_email_format_chk') THEN
    ALTER TABLE customer_email_otp_challenges
      ADD CONSTRAINT customer_email_otp_challenges_email_format_chk
      CHECK (email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_email_otp_challenges_attempts_chk') THEN
    ALTER TABLE customer_email_otp_challenges
      ADD CONSTRAINT customer_email_otp_challenges_attempts_chk
      CHECK (attempts >= 0 AND attempts <= 20);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_email_otp_challenges_lookup
  ON customer_email_otp_challenges (lower(email), shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_email_otp_challenges_active
  ON customer_email_otp_challenges (lower(email), shop_id, expires_at DESC)
  WHERE consumed_at IS NULL;
