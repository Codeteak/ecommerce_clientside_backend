-- Sole PostgreSQL migration for fresh deployment of the multi-tenant ecommerce schema.
-- Apply this entire file once per new database (e.g. psql -f 001_deployment_postgresql.sql).
-- Layout targets fresh installs (inline FKs, CHECKs, timestamps on CREATE TABLE); idempotent
-- ALTER … IF NOT EXISTS / DROP IF EXISTS blocks also help bring older databases closer to current shape.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Normalized address table shared by shops/customers (and future entities).
CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line1 TEXT,
  line2 TEXT,
  landmark TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  raw TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'addresses_lat_lng_bounds_chk') THEN
    ALTER TABLE addresses
      ADD CONSTRAINT addresses_lat_lng_bounds_chk CHECK (
        (lat IS NULL AND lng IS NULL)
        OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
      );
  END IF;
END $$;

-- `users` before `shops` so `shops.owner_user_id` can reference `users(id)` inline.
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

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

ALTER TABLE shops ADD COLUMN IF NOT EXISTS domain TEXT;
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

CREATE TABLE IF NOT EXISTS shop_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'picker')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_name TEXT,
  device_push_token TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'deleted')),
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (shop_id, user_id)
);

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

CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id UUID,
  title_snapshot TEXT NOT NULL,
  quantity NUMERIC(18, 4) NOT NULL,
  unit_label TEXT NOT NULL,
  unit_price_minor BIGINT NOT NULL,
  is_custom BOOLEAN NOT NULL DEFAULT false,
  custom_note TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  order_number TEXT NOT NULL,
  status TEXT NOT NULL CONSTRAINT orders_status_chk
    CHECK (status IN ('pending', 'accepted', 'picking', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'rejected')),
  payment_method TEXT NOT NULL DEFAULT 'cod',
  subtotal_minor BIGINT NOT NULL,
  delivery_fee_minor BIGINT NOT NULL DEFAULT 0,
  total_minor BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  picker_id UUID REFERENCES users(id) ON DELETE SET NULL,
  picker_name TEXT,
  notes TEXT,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  out_for_delivery_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  UNIQUE (shop_id, order_number)
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID,
  product_name_snapshot TEXT NOT NULL,
  unit_label_snapshot TEXT NOT NULL,
  quantity NUMERIC(18, 4) NOT NULL,
  unit_price_minor_snapshot BIGINT NOT NULL,
  line_total_minor BIGINT NOT NULL,
  is_custom BOOLEAN NOT NULL DEFAULT false,
  custom_note TEXT
);

CREATE TABLE IF NOT EXISTS outbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256 CHAR(64) NOT NULL UNIQUE,
  storage_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entity_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CONSTRAINT entity_images_entity_type_check
    CHECK (entity_type IN ('shop', 'picker', 'category')),
  entity_id UUID NOT NULL,
  media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, entity_type, entity_id)
);

-- ---------------------------------------------------------------------------
-- Global catalog core + shop overlay (fresh-install baseline)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS global_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'shared' CHECK (scope IN ('shared', 'private')),
  owner_shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES global_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS global_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'shared' CHECK (scope IN ('shared', 'private')),
  owner_shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS global_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('shared', 'private')),
  owner_shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  global_category_id UUID REFERENCES global_categories(id) ON DELETE SET NULL,
  global_brand_id UUID REFERENCES global_brands(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  base_unit TEXT NOT NULL,
  description TEXT,
  category_path TEXT,
  upc TEXT,
  specs TEXT,
  image_url TEXT,
  code TEXT,
  code_type TEXT,
  inferred BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shop_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  global_product_id UUID NOT NULL REFERENCES global_products(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  availability TEXT NOT NULL DEFAULT 'in_stock'
    CHECK (availability IN ('in_stock', 'out_of_stock', 'unknown')),
  price_minor_per_unit BIGINT NOT NULL,
  offer_price_minor_per_unit BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, global_product_id)
);

CREATE TABLE IF NOT EXISTS global_product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_product_id UUID NOT NULL REFERENCES global_products(id) ON DELETE CASCADE,
  media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  sort_order SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT global_product_images_sort_order_chk CHECK (sort_order >= 0 AND sort_order < 6),
  CONSTRAINT global_product_images_gp_sort_uidx UNIQUE (global_product_id, sort_order),
  CONSTRAINT global_product_images_gp_asset_uidx UNIQUE (global_product_id, media_asset_id)
);

CREATE TABLE IF NOT EXISTS shop_product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_product_id UUID NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  sort_order SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shop_product_images_sort_order_chk CHECK (sort_order >= 0 AND sort_order < 6),
  CONSTRAINT shop_product_images_sp_sort_uidx UNIQUE (shop_product_id, sort_order),
  CONSTRAINT shop_product_images_sp_asset_uidx UNIQUE (shop_product_id, media_asset_id)
);

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_shop_uuid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_shop_id', true), '')::uuid
$$;
