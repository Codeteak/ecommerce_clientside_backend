CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  address_id UUID REFERENCES addresses(id) ON DELETE SET NULL,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_display_name_len_chk') THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_display_name_len_chk
      CHECK (display_name IS NULL OR char_length(display_name) <= 120);
  END IF;
END $$;
