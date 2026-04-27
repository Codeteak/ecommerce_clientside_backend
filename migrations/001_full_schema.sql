-- Sole PostgreSQL schema file for this service (fresh deploys + idempotent upgrades).
-- Apply with `npm run db:migrate` or `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/001_full_schema.sql`.
-- Layout: inline FKs/CHECKs on CREATE TABLE where possible; ADD COLUMN IF NOT EXISTS / DO blocks
-- for databases created from older revisions.

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
  -- Human-readable ID for integrations / support (optional; set manually).
  -- Examples: test-202506281932, brigade-hyper-mart-202603110807
  public_id TEXT UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  custom_domain TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Operational details (kept flexible but constrained)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'deleted')),
  phone TEXT,
  email TEXT,
  address_id UUID REFERENCES addresses(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  service_area_radius_meters INTEGER NOT NULL DEFAULT 5000,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  inventory_tracking_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Basic data hygiene / limits (not overly strict to avoid blocking real-world values).
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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_custom_domain_len_chk') THEN
    ALTER TABLE shops ADD CONSTRAINT shops_custom_domain_len_chk CHECK (custom_domain IS NULL OR char_length(custom_domain) <= 255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_phone_len_chk') THEN
    ALTER TABLE shops ADD CONSTRAINT shops_phone_len_chk CHECK (phone IS NULL OR char_length(phone) <= 32);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_email_len_chk') THEN
    ALTER TABLE shops ADD CONSTRAINT shops_email_len_chk CHECK (email IS NULL OR char_length(email) <= 254);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_service_area_radius_positive_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_service_area_radius_positive_chk
      CHECK (service_area_radius_meters > 0);
  END IF;
END $$;

-- Stricter format checks for shop-facing identifiers.
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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_custom_domain_format_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_custom_domain_format_chk
      CHECK (
        custom_domain IS NULL
        OR custom_domain ~* '^[A-Z0-9](?:[A-Z0-9\-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9\-]{0,61}[A-Z0-9])?)+$'
      );
  END IF;
END $$;

-- Upgrade: `shops` without `owner_user_id` (column is inline on fresh CREATE).
ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_user_id UUID;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS service_area_radius_meters INTEGER;
UPDATE shops
SET service_area_radius_meters = 5000
WHERE service_area_radius_meters IS NULL OR service_area_radius_meters <= 0;
ALTER TABLE shops ALTER COLUMN service_area_radius_meters SET DEFAULT 5000;
ALTER TABLE shops ALTER COLUMN service_area_radius_meters SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_owner_user_id_fkey') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_categories_shop_parent ON categories(shop_id, parent_id);

CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, id),
  UNIQUE (shop_id, name)
);

CREATE INDEX IF NOT EXISTS idx_brands_shop_active_name
  ON brands(shop_id, name)
  WHERE is_deleted = false;

-- Upgrade: category audit columns (present inline on fresh CREATE).
ALTER TABLE categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  brand_id UUID,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  base_unit TEXT NOT NULL,
  status TEXT NOT NULL,
  availability TEXT NOT NULL DEFAULT 'in_stock' CONSTRAINT products_availability_chk
    CHECK (availability IN ('in_stock', 'out_of_stock', 'unknown')),
  price_minor_per_unit BIGINT NOT NULL,
  offer_price_minor_per_unit BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_products_shop_category ON products(shop_id, category_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_products_shop_brand ON products(shop_id, brand_id) WHERE status = 'active';

-- Upgrade: columns folded into CREATE on fresh installs.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS inventory_tracking_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'in_stock';
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id UUID;
ALTER TABLE products ADD COLUMN IF NOT EXISTS offer_price_minor_per_unit BIGINT;
UPDATE products
SET offer_price_minor_per_unit = price_minor_per_unit
WHERE offer_price_minor_per_unit IS NULL;
ALTER TABLE products ALTER COLUMN offer_price_minor_per_unit SET NOT NULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_brand_id_fkey') THEN
    ALTER TABLE products DROP CONSTRAINT products_brand_id_fkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_shop_brand_fkey') THEN
    ALTER TABLE products
      ADD CONSTRAINT products_shop_brand_fkey
      FOREIGN KEY (shop_id, brand_id) REFERENCES brands(shop_id, id) ON DELETE RESTRICT;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_availability_chk') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'availability'
    ) THEN
      ALTER TABLE products
        ADD CONSTRAINT products_availability_chk
        CHECK (availability IN ('in_stock', 'out_of_stock', 'unknown'));
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  track_type TEXT NOT NULL,
  stock_quantity NUMERIC(18, 4) NOT NULL,
  UNIQUE (shop_id, product_id)
);

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

-- Backfill: migrate legacy `shops.address`/`shops.location` and `customers.address` into `addresses`.
-- This block is safe to re-run (only fills when *_address_id is NULL).
DO $$
DECLARE
  r_shop RECORD;
  r_cust RECORD;
  new_addr_id UUID;
  loc_lat DOUBLE PRECISION;
  loc_lng DOUBLE PRECISION;
BEGIN
  -- Upgrade-only: legacy JSONB / old column shapes. On a fresh DB from this file, most branches no-op.
  IF to_regclass('public.shop_staff') IS NOT NULL THEN
    ALTER TABLE shop_staff ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE shop_staff ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE shop_staff ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE shop_staff ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE shop_staff ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  END IF;

  IF to_regclass('public.customer_shop_memberships') IS NOT NULL THEN
    ALTER TABLE customer_shop_memberships ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE customer_shop_memberships ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE customer_shop_memberships ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE customer_shop_memberships ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  END IF;

  -- Best-effort backfill for shops based on existing `status` semantics.
  UPDATE shops
    SET is_blocked = (status = 'blocked'),
        is_deleted = (status = 'deleted')
    WHERE (is_blocked = false OR is_deleted = false)
      AND status IN ('blocked', 'deleted');

  UPDATE shops
    SET deleted_at = COALESCE(deleted_at, updated_at, now())
    WHERE is_deleted = true AND deleted_at IS NULL;

  -- Ensure columns exist if this script runs against a DB created before the change.
  ALTER TABLE shops ADD COLUMN IF NOT EXISTS address_id UUID;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_id UUID;

  -- Add FKs if missing (idempotent).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_address_id_fkey') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_address_id_fkey
      FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_address_id_fkey') THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_address_id_fkey
      FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE SET NULL;
  END IF;

  -- Shops: if legacy columns exist, move values into addresses.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shops' AND column_name = 'address'
  ) THEN
    FOR r_shop IN
      EXECUTE 'SELECT id, address, location FROM shops WHERE address_id IS NULL AND (address IS NOT NULL OR location IS NOT NULL)'
    LOOP
      loc_lat := NULL;
      loc_lng := NULL;
      IF r_shop.location IS NOT NULL THEN
        BEGIN
          loc_lat := NULLIF((r_shop.location->>'lat'), '')::double precision;
          loc_lng := NULLIF((r_shop.location->>'lng'), '')::double precision;
        EXCEPTION WHEN others THEN
          loc_lat := NULL;
          loc_lng := NULL;
        END;
      END IF;

      INSERT INTO addresses (raw, lat, lng)
      VALUES (r_shop.address, loc_lat, loc_lng)
      RETURNING id INTO new_addr_id;

      UPDATE shops SET address_id = new_addr_id WHERE id = r_shop.id;
    END LOOP;
  END IF;

  -- Customers: if legacy column exists, move values into addresses.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'address'
  ) THEN
    FOR r_cust IN
      EXECUTE 'SELECT id, address FROM customers WHERE address_id IS NULL AND address IS NOT NULL'
    LOOP
      INSERT INTO addresses (raw)
      VALUES (r_cust.address)
      RETURNING id INTO new_addr_id;

      UPDATE customers SET address_id = new_addr_id WHERE id = r_cust.id;
    END LOOP;
  END IF;

  -- Drop legacy constraints/columns if present (safe for fresh installs + upgrades).
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_address_len_chk') THEN
    ALTER TABLE shops DROP CONSTRAINT shops_address_len_chk;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_location_shape_chk') THEN
    ALTER TABLE shops DROP CONSTRAINT shops_location_shape_chk;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_address_len_chk') THEN
    ALTER TABLE customers DROP CONSTRAINT customers_address_len_chk;
  END IF;

  ALTER TABLE shops DROP COLUMN IF EXISTS address;
  ALTER TABLE shops DROP COLUMN IF EXISTS location;
  ALTER TABLE customers DROP COLUMN IF EXISTS address;

  -- Drop JSONB columns after adding explicit fields.
  ALTER TABLE shops DROP COLUMN IF EXISTS timelines;
  ALTER TABLE shops DROP COLUMN IF EXISTS actions;
  ALTER TABLE customers DROP COLUMN IF EXISTS actions;
  IF to_regclass('public.shop_staff') IS NOT NULL THEN
    ALTER TABLE shop_staff DROP COLUMN IF EXISTS timelines;
    ALTER TABLE shop_staff DROP COLUMN IF EXISTS actions;
  END IF;
  IF to_regclass('public.customer_shop_memberships') IS NOT NULL THEN
    ALTER TABLE customer_shop_memberships DROP COLUMN IF EXISTS actions;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS shop_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'picker')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'deleted')),
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (shop_id, user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_staff_display_name_len_chk') THEN
    ALTER TABLE shop_staff
      ADD CONSTRAINT shop_staff_display_name_len_chk
      CHECK (display_name IS NULL OR char_length(display_name) <= 120);
  END IF;
END $$;

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

-- JSONB defaults are set inline in CREATE TABLE to keep this file idempotent.

CREATE INDEX IF NOT EXISTS idx_customer_shop_memberships_shop
  ON customer_shop_memberships(shop_id, customer_id)
  WHERE is_active = true;

-- Common admin filters: shop + flags + joins.
CREATE INDEX IF NOT EXISTS idx_customer_shop_memberships_shop_flags
  ON customer_shop_memberships(shop_id, is_deleted, is_blocked, is_active, customer_id);

-- Helps ORDER BY c.created_at DESC in admin lists.
CREATE INDEX IF NOT EXISTS idx_customers_created_at_desc
  ON customers (created_at DESC);

-- Purpose: Stores customer OTP login challenges (hashed code, TTL, attempts, single-use).

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

CREATE TABLE IF NOT EXISTS customer_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  jwt_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  replaced_by_token_hash TEXT,
  issued_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_refresh_tokens_user_id
  ON customer_refresh_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_customer_refresh_tokens_customer_id
  ON customer_refresh_tokens(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_refresh_tokens_expires_at
  ON customer_refresh_tokens(expires_at);

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
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  title_snapshot TEXT NOT NULL,
  quantity NUMERIC(18, 4) NOT NULL,
  unit_label TEXT NOT NULL,
  unit_price_minor BIGINT NOT NULL,
  is_custom BOOLEAN NOT NULL DEFAULT false,
  custom_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);

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

CREATE INDEX IF NOT EXISTS idx_orders_shop_status_placed ON orders(shop_id, status, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_shop_customer_placed ON orders (shop_id, customer_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_shop_placed ON orders(shop_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_shop_order_number_ci ON orders(shop_id, lower(order_number));
CREATE INDEX IF NOT EXISTS idx_orders_shop_picker_name_ci ON orders(shop_id, lower(picker_name))
  WHERE picker_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_shop_customer_name_ci ON orders (shop_id, lower(customer_name))
  WHERE customer_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_shop_customer_phone ON orders (shop_id, customer_phone)
  WHERE customer_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_shop_picker_status_placed
  ON orders (shop_id, picker_id, status, placed_at DESC)
  WHERE picker_id IS NOT NULL;

-- Forward-compat for databases created before these columns existed on orders.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS out_for_delivery_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS picker_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS picker_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_address TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_picker_id_fkey') THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_picker_id_fkey
      FOREIGN KEY (picker_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Upgrade: constrain order status values (older DBs may have free-form TEXT).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_chk') THEN
    IF EXISTS (
      SELECT 1 FROM orders o
      WHERE o.status NOT IN ('pending', 'accepted', 'picking', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'rejected')
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'orders.status contains invalid values; fix rows before adding constraint orders_status_chk';
    END IF;
    ALTER TABLE orders
      ADD CONSTRAINT orders_status_chk
      CHECK (status IN ('pending', 'accepted', 'picking', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name_snapshot TEXT NOT NULL,
  unit_label_snapshot TEXT NOT NULL,
  quantity NUMERIC(18, 4) NOT NULL,
  unit_price_minor_snapshot BIGINT NOT NULL,
  line_total_minor BIGINT NOT NULL,
  is_custom BOOLEAN NOT NULL DEFAULT false,
  custom_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS outbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_messages_pending_created
  ON outbox_messages (created_at)
  WHERE published_at IS NULL;

-- Deduplicated media blobs and tenant-bound image bindings.
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

CREATE INDEX IF NOT EXISTS idx_entity_images_media_asset ON entity_images(media_asset_id);

-- Product gallery (1–6 images per product; categories still use single `entity_images` row).
CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  sort_order SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_images_sort_order_chk CHECK (sort_order >= 0 AND sort_order < 6),
  CONSTRAINT product_images_shop_product_sort_uidx UNIQUE (shop_id, product_id, sort_order),
  CONSTRAINT product_images_shop_product_asset_uidx UNIQUE (shop_id, product_id, media_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_product_images_shop_product_sort
  ON product_images (shop_id, product_id, sort_order);

INSERT INTO product_images (id, shop_id, product_id, media_asset_id, sort_order, created_at, updated_at)
SELECT gen_random_uuid(), e.shop_id, e.entity_id, e.media_asset_id, 0, e.created_at, e.updated_at
FROM entity_images e
WHERE e.entity_type = 'product'
ON CONFLICT (shop_id, product_id, sort_order) DO NOTHING;

DELETE FROM entity_images WHERE entity_type = 'product';

-- Upgrade: widen `entity_type` when table predates `category` (fresh CREATE already includes it).
ALTER TABLE entity_images DROP CONSTRAINT IF EXISTS entity_images_entity_type_check;
ALTER TABLE entity_images
  ADD CONSTRAINT entity_images_entity_type_check
  CHECK (entity_type IN ('shop', 'picker', 'category'));

-- RLS for tenant isolation.
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_shop_uuid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_shop_id', true), '')::uuid
$$;

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_tenant_isolation ON categories;
CREATE POLICY categories_tenant_isolation ON categories
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS products_tenant_isolation ON products;
CREATE POLICY products_tenant_isolation ON products
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS brands_tenant_isolation ON brands;
CREATE POLICY brands_tenant_isolation ON brands
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS inventory_items_tenant_isolation ON inventory_items;
CREATE POLICY inventory_items_tenant_isolation ON inventory_items
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS shop_staff_tenant_isolation ON shop_staff;
CREATE POLICY shop_staff_tenant_isolation ON shop_staff
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS carts_tenant_isolation ON carts;
CREATE POLICY carts_tenant_isolation ON carts
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS cart_items_tenant_isolation ON cart_items;
CREATE POLICY cart_items_tenant_isolation ON cart_items
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS orders_tenant_isolation ON orders;
CREATE POLICY orders_tenant_isolation ON orders
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS order_items_tenant_isolation ON order_items;
CREATE POLICY order_items_tenant_isolation ON order_items
USING (
  EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.id = order_items.order_id
      AND o.shop_id = app.current_shop_uuid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.id = order_items.order_id
      AND o.shop_id = app.current_shop_uuid()
  )
);

DROP POLICY IF EXISTS entity_images_tenant_isolation ON entity_images;
CREATE POLICY entity_images_tenant_isolation ON entity_images
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS product_images_tenant_isolation ON product_images;
CREATE POLICY product_images_tenant_isolation ON product_images
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

ALTER TABLE categories FORCE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_items FORCE ROW LEVEL SECURITY;
ALTER TABLE shop_staff FORCE ROW LEVEL SECURITY;
ALTER TABLE carts FORCE ROW LEVEL SECURITY;
ALTER TABLE cart_items FORCE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE entity_images FORCE ROW LEVEL SECURITY;
ALTER TABLE product_images FORCE ROW LEVEL SECURITY;

-- List/filter performance (shop-scoped partial / composite).
CREATE INDEX IF NOT EXISTS idx_products_shop_status_created
  ON products (shop_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_categories_shop_created
  ON categories (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_shop_name_lower
  ON products (shop_id, lower(name));
-- Storefront filters: active products by availability + sort by created_at (partial keeps index small).
CREATE INDEX IF NOT EXISTS idx_products_shop_active_availability_created
  ON products (shop_id, availability, created_at DESC)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_categories_shop_name_lower
  ON categories (shop_id, lower(name));

-- Resolve shop_staff by globally unique staff_login_code when HTTP request has no shop context (RLS would otherwise hide rows).
CREATE OR REPLACE FUNCTION app.lookup_shop_staff_by_login_code(p_code integer)
RETURNS TABLE (
  user_id uuid,
  shop_id uuid,
  role text,
  email text,
  phone text,
  password_hash text,
  staff_login_code integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT s.user_id, s.shop_id, s.role, u.email, u.phone, u.password_hash, u.staff_login_code
  FROM shop_staff s
  JOIN users u ON u.id = s.user_id
  WHERE s.is_active = true
    AND u.is_active = true
    AND u.staff_login_code = p_code
    AND s.role <> 'picker';
$$;

REVOKE ALL ON FUNCTION app.lookup_shop_staff_by_login_code(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lookup_shop_staff_by_login_code(integer) TO PUBLIC;

-- Cross-shop product gallery reuse (same slug): pick the product with the most gallery images, tie-break by latest image activity.
CREATE OR REPLACE FUNCTION app.find_fallback_product_gallery_ids_by_slug(p_slug text)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_norm text := lower(trim(p_slug));
  v_pid uuid;
  v_ids uuid[];
BEGIN
  IF v_norm = '' THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT wc.product_id INTO v_pid
  FROM (
    SELECT p.id AS product_id,
           COUNT(pi.id) AS image_cnt,
           MAX(pi.updated_at) AS gallery_max_updated
    FROM products p
    JOIN product_images pi ON pi.product_id = p.id AND pi.shop_id = p.shop_id
    WHERE lower(p.slug) = v_norm
    GROUP BY p.id
  ) wc
  ORDER BY wc.image_cnt DESC, wc.gallery_max_updated DESC NULLS LAST, wc.product_id ASC
  LIMIT 1;

  IF v_pid IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT array_agg(sub.media_asset_id ORDER BY sub.sort_order)
  INTO v_ids
  FROM (
    SELECT pi.media_asset_id, pi.sort_order
    FROM product_images pi
    WHERE pi.product_id = v_pid
    ORDER BY pi.sort_order ASC
    LIMIT 10
  ) sub;

  RETURN COALESCE(v_ids, ARRAY[]::uuid[]);
END;
$$;

DO $$
DECLARE
  tbl_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(c.relowner)::name INTO STRICT tbl_owner
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'product_images'
    AND c.relkind = 'r'
  LIMIT 1;
  EXECUTE format(
    'ALTER FUNCTION app.find_fallback_product_gallery_ids_by_slug(text) OWNER TO %I',
    tbl_owner
  );
EXCEPTION
  WHEN OTHERS THEN
    EXECUTE 'ALTER FUNCTION app.find_fallback_product_gallery_ids_by_slug(text) OWNER TO postgres';
END $$;

ALTER FUNCTION app.find_fallback_product_gallery_ids_by_slug(text) SET row_security = off;

REVOKE ALL ON FUNCTION app.find_fallback_product_gallery_ids_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.find_fallback_product_gallery_ids_by_slug(text) TO PUBLIC;

-- Per-shop gallery reuse (same slug, same shop only): deterministic — most images, then latest gallery activity, then product id (no cross-shop randomness).
CREATE OR REPLACE FUNCTION app.find_fallback_product_gallery_ids_by_slug_and_shop(p_shop_id uuid, p_slug text)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_norm text := lower(trim(p_slug));
  v_pid uuid;
  v_ids uuid[];
BEGIN
  IF v_norm = '' OR p_shop_id IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT wc.product_id INTO v_pid
  FROM (
    SELECT p.id AS product_id,
           COUNT(pi.id) AS image_cnt,
           MAX(pi.updated_at) AS gallery_max_updated
    FROM products p
    JOIN product_images pi ON pi.product_id = p.id AND pi.shop_id = p.shop_id
    WHERE p.shop_id = p_shop_id
      AND lower(p.slug) = v_norm
    GROUP BY p.id
  ) wc
  ORDER BY wc.image_cnt DESC, wc.gallery_max_updated DESC NULLS LAST, wc.product_id ASC
  LIMIT 1;

  IF v_pid IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT array_agg(sub.media_asset_id ORDER BY sub.sort_order)
  INTO v_ids
  FROM (
    SELECT pi.media_asset_id, pi.sort_order
    FROM product_images pi
    WHERE pi.shop_id = p_shop_id
      AND pi.product_id = v_pid
    ORDER BY pi.sort_order ASC
    LIMIT 6
  ) sub;

  RETURN COALESCE(v_ids, ARRAY[]::uuid[]);
END;
$$;

DO $$
DECLARE
  tbl_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(c.relowner)::name INTO STRICT tbl_owner
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'product_images'
    AND c.relkind = 'r'
  LIMIT 1;
  EXECUTE format(
    'ALTER FUNCTION app.find_fallback_product_gallery_ids_by_slug_and_shop(uuid, text) OWNER TO %I',
    tbl_owner
  );
EXCEPTION
  WHEN OTHERS THEN
    EXECUTE 'ALTER FUNCTION app.find_fallback_product_gallery_ids_by_slug_and_shop(uuid, text) OWNER TO postgres';
END $$;

ALTER FUNCTION app.find_fallback_product_gallery_ids_by_slug_and_shop(uuid, text) SET row_security = off;

REVOKE ALL ON FUNCTION app.find_fallback_product_gallery_ids_by_slug_and_shop(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.find_fallback_product_gallery_ids_by_slug_and_shop(uuid, text) TO PUBLIC;

-- Cross-shop catalog image reuse: RLS on entity_images/categories/products would hide other tenants.
-- FORCE RLS + session `app.current_shop_id` means policies still filter by shop unless row security is off
-- *for the table owner*; align function owner to `entity_images` (DO block below) after CREATE.
CREATE OR REPLACE FUNCTION app.find_fallback_media_asset_id_by_slug(p_entity_type text, p_slug text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_id uuid;
  v_norm text := lower(trim(p_slug));
  v_gallery uuid[];
BEGIN
  -- Do not use SET/SET LOCAL here: STABLE functions cannot execute SET (0A000). Row security is disabled
  -- for this call via the function attributes `SET row_security = off` below and on CREATE, plus owner
  -- alignment to `entity_images` so FORCE RLS policies are skipped for those reads.
  IF v_norm = '' OR p_entity_type NOT IN ('category', 'product') THEN
    RETURN NULL;
  END IF;
  IF p_entity_type = 'category' THEN
    SELECT m.id INTO v_id
    FROM entity_images e
    JOIN media_assets m ON m.id = e.media_asset_id
    JOIN categories c ON c.id = e.entity_id
    WHERE e.entity_type = 'category'
      AND lower(c.slug) = v_norm
    ORDER BY e.updated_at DESC NULLS LAST
    LIMIT 1;
    RETURN v_id;
  END IF;
  -- Products use `product_images`; single-asset fallback is primary (lowest sort_order) of cross-shop gallery.
  v_gallery := app.find_fallback_product_gallery_ids_by_slug(p_slug);
  IF v_gallery IS NOT NULL AND cardinality(v_gallery) >= 1 THEN
    RETURN v_gallery[1];
  END IF;
  RETURN NULL;
END;
$$;

-- Under FORCE ROW LEVEL SECURITY, `SET row_security = off` only skips policies for the *table owner*.
-- If this function is owned by `postgres` but `public.entity_images` is owned by another role (common on
-- hosted Postgres), policies still run and `shop_id = app.current_shop_uuid()` hides every other tenant.
-- Align function owner to `entity_images` so the fallback SELECT can see all shops.
DO $$
DECLARE
  tbl_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(c.relowner)::name INTO STRICT tbl_owner
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'entity_images'
    AND c.relkind = 'r'
  LIMIT 1;
  EXECUTE format(
    'ALTER FUNCTION app.find_fallback_media_asset_id_by_slug(text, text) OWNER TO %I',
    tbl_owner
  );
EXCEPTION
  WHEN OTHERS THEN
    EXECUTE 'ALTER FUNCTION app.find_fallback_media_asset_id_by_slug(text, text) OWNER TO postgres';
END $$;

ALTER FUNCTION app.find_fallback_media_asset_id_by_slug(text, text) SET row_security = off;

REVOKE ALL ON FUNCTION app.find_fallback_media_asset_id_by_slug(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.find_fallback_media_asset_id_by_slug(text, text) TO PUBLIC;

-- Shared-catalog preview API: union all product gallery assets for this slug (any shop), max 6 distinct ids.
CREATE OR REPLACE FUNCTION app.find_shared_catalog_gallery_asset_ids_by_slug(p_slug text)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_norm text := lower(trim(p_slug));
  v_ids uuid[];
BEGIN
  IF v_norm = '' THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT COALESCE(array_agg(z.media_asset_id ORDER BY z.min_ord), ARRAY[]::uuid[])
  INTO v_ids
  FROM (
    SELECT y.media_asset_id, y.min_ord
    FROM (
      SELECT x.media_asset_id, MIN(x.global_ord) AS min_ord
      FROM (
        SELECT
          pi.media_asset_id,
          ROW_NUMBER() OVER (
            ORDER BY pr.updated_at DESC NULLS LAST, pi.sort_order ASC, pr.id, pi.id
          ) AS global_ord
        FROM product_images pi
        INNER JOIN products pr ON pr.id = pi.product_id AND pr.shop_id = pi.shop_id
        WHERE lower(pr.slug) = v_norm
      ) x
      GROUP BY x.media_asset_id
    ) y
    ORDER BY y.min_ord
    LIMIT 10
  ) z;

  RETURN COALESCE(v_ids, ARRAY[]::uuid[]);
END;
$$;

DO $$
DECLARE
  tbl_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(c.relowner)::name INTO STRICT tbl_owner
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'product_images'
    AND c.relkind = 'r'
  LIMIT 1;
  EXECUTE format(
    'ALTER FUNCTION app.find_shared_catalog_gallery_asset_ids_by_slug(text) OWNER TO %I',
    tbl_owner
  );
EXCEPTION
  WHEN OTHERS THEN
    EXECUTE 'ALTER FUNCTION app.find_shared_catalog_gallery_asset_ids_by_slug(text) OWNER TO postgres';
END $$;

ALTER FUNCTION app.find_shared_catalog_gallery_asset_ids_by_slug(text) SET row_security = off;

REVOKE ALL ON FUNCTION app.find_shared_catalog_gallery_asset_ids_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.find_shared_catalog_gallery_asset_ids_by_slug(text) TO PUBLIC;