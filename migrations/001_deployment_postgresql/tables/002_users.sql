CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  staff_login_code INTEGER,
  picker_login_code INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Super admin table (global admins not tied to a specific shop).
