CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  domain TEXT UNIQUE,
  service_area_radius_meters INTEGER NOT NULL DEFAULT 5000,
  custom_domain TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'deleted')),
  phone TEXT,
  email TEXT,
  address_id UUID REFERENCES addresses(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  banner_enabled BOOLEAN NOT NULL DEFAULT true,
  banner_media_asset_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE shops ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS service_area_radius_meters INTEGER NOT NULL DEFAULT 5000;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_public_id_len_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_public_id_len_chk
      CHECK (public_id IS NULL OR char_length(public_id) BETWEEN 3 AND 128);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_slug_len_chk') THEN
    ALTER TABLE shops ADD CONSTRAINT shops_slug_len_chk CHECK (char_length(slug) BETWEEN 1 AND 64);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_name_len_chk') THEN
    ALTER TABLE shops ADD CONSTRAINT shops_name_len_chk CHECK (char_length(name) BETWEEN 1 AND 160);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_domain_len_chk') THEN
    ALTER TABLE shops ADD CONSTRAINT shops_domain_len_chk CHECK (domain IS NULL OR char_length(domain) <= 255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_custom_domain_len_chk') THEN
    ALTER TABLE shops ADD CONSTRAINT shops_custom_domain_len_chk CHECK (custom_domain IS NULL OR char_length(custom_domain) <= 255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_phone_len_chk') THEN
    ALTER TABLE shops ADD CONSTRAINT shops_phone_len_chk CHECK (phone IS NULL OR char_length(phone) <= 32);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_email_len_chk') THEN
    ALTER TABLE shops ADD CONSTRAINT shops_email_len_chk CHECK (email IS NULL OR char_length(email) <= 254);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_public_id_format_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_public_id_format_chk
      CHECK (public_id IS NULL OR public_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_slug_format_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_slug_format_chk
      CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_email_format_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_email_format_chk
      CHECK (email IS NULL OR email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_phone_format_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_phone_format_chk
      CHECK (phone IS NULL OR phone ~ '^[0-9+][0-9]{7,31}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_domain_format_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_domain_format_chk
      CHECK (
        domain IS NULL
        OR domain ~* '^[A-Z0-9](?:[A-Z0-9\-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9\-]{0,61}[A-Z0-9])?)+$'
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_custom_domain_format_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_custom_domain_format_chk
      CHECK (
        custom_domain IS NULL
        OR custom_domain ~* '^[A-Z0-9](?:[A-Z0-9\-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9\-]{0,61}[A-Z0-9])?)+$'
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS shops_domain_uniq_idx ON shops (domain) WHERE domain IS NOT NULL;

ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_user_id UUID;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_owner_user_id_fkey') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
