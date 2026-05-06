CREATE TABLE IF NOT EXISTS super_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_login_code INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS picker_login_code INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_staff_login_code_range_chk') THEN
    ALTER TABLE users
      ADD CONSTRAINT users_staff_login_code_range_chk
      CHECK (staff_login_code IS NULL OR (staff_login_code BETWEEN 100000 AND 999999));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_picker_login_code_range_chk') THEN
    ALTER TABLE users
      ADD CONSTRAINT users_picker_login_code_range_chk
      CHECK (picker_login_code IS NULL OR (picker_login_code BETWEEN 100000 AND 999999));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_staff_login_code_uidx
  ON users (staff_login_code)
  WHERE staff_login_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_picker_login_code_uidx
  ON users (picker_login_code)
  WHERE picker_login_code IS NOT NULL;

-- Case-insensitive lookups for admin/customer search.
CREATE INDEX IF NOT EXISTS idx_users_email_ci
  ON users (lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_phone
  ON users (phone)
  WHERE phone IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_len_chk') THEN
    ALTER TABLE users ADD CONSTRAINT users_email_len_chk CHECK (email IS NULL OR char_length(email) <= 254);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_len_chk') THEN
    ALTER TABLE users ADD CONSTRAINT users_phone_len_chk CHECK (phone IS NULL OR char_length(phone) <= 32);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_format_chk') THEN
    ALTER TABLE users
      ADD CONSTRAINT users_email_format_chk
      CHECK (email IS NULL OR email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_format_chk') THEN
    ALTER TABLE users
      ADD CONSTRAINT users_phone_format_chk
      CHECK (phone IS NULL OR phone ~ '^[0-9+][0-9]{7,31}$');
  END IF;
END $$;
