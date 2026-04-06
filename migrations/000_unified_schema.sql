-- Unified PostgreSQL deployment script for the multi-tenant ecommerce schema.
-- This replaces split migrations 001..005 for fresh environment provisioning.
-- Includes RLS tenant isolation + outbox table.

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

CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  custom_domain TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Operational details (kept flexible but constrained)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'deleted')),
  phone TEXT,
  email TEXT,
  address_id UUID REFERENCES addresses(id) ON DELETE SET NULL,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Basic data hygiene / limits (not overly strict to avoid blocking real-world values).
DO $$
BEGIN
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
  UNIQUE (shop_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_categories_shop_parent ON categories(shop_id, parent_id);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  base_unit TEXT NOT NULL,
  status TEXT NOT NULL,
  price_minor_per_unit BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_products_shop_category ON products(shop_id, category_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  track_type TEXT NOT NULL,
  stock_quantity NUMERIC(18, 4) NOT NULL,
  UNIQUE (shop_id, product_id)
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
      CHECK (email IS NULL OR email ~* '^[A-Z0-9._%+\\-]+@[A-Z0-9.\\-]+\\.[A-Z]{2,}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_format_chk') THEN
    ALTER TABLE users
      ADD CONSTRAINT users_phone_format_chk
      CHECK (phone IS NULL OR phone ~ '^[0-9+][0-9]{7,31}$');
  END IF;
END $$;

-- How the storefront user row was first created: email/password vs Google (OAuth).
DO $$
BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_source TEXT;
  UPDATE users
     SET registration_source = CASE WHEN password_hash IS NULL THEN 'google' ELSE 'password' END
   WHERE registration_source IS NULL;
  ALTER TABLE users ALTER COLUMN registration_source SET DEFAULT 'password';
  ALTER TABLE users ALTER COLUMN registration_source SET NOT NULL;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_registration_source_chk') THEN
    ALTER TABLE users
      ADD CONSTRAINT users_registration_source_chk
      CHECK (registration_source IN ('password', 'google'));
  END IF;
END $$;

-- Stricter format checks for shop-facing identifiers.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_slug_format_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_slug_format_chk
      CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_email_format_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_email_format_chk
      CHECK (email IS NULL OR email ~* '^[A-Z0-9._%+\\-]+@[A-Z0-9.\\-]+\\.[A-Z]{2,}$');
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
        OR custom_domain ~* '^[A-Z0-9](?:[A-Z0-9\\-]{0,61}[A-Z0-9])?(?:\\.[A-Z0-9](?:[A-Z0-9\\-]{0,61}[A-Z0-9])?)+$'
      );
  END IF;
END $$;

-- Optional linkage from shop -> primary owner account (keeps password in `users`).
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS owner_user_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shops_owner_user_id_fkey'
  ) THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Platform identity (Option A): a superadmin is a user with platform-level capabilities.
CREATE TABLE IF NOT EXISTS superadmins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  otp_hash TEXT,
  otp_expires_at TIMESTAMPTZ,
  otp_used_at TIMESTAMPTZ,
  otp_attempts INT NOT NULL DEFAULT 0,
  otp_last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
  -- Ensure columns exist if this script runs against a DB created before the change.
  ALTER TABLE shops ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE shops ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE shops ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  ALTER TABLE shops ADD COLUMN IF NOT EXISTS address_id UUID;

  ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_id UUID;

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
          loc_lat := NULLIF((r_shop.location->>''lat''), '''')::double precision;
          loc_lng := NULLIF((r_shop.location->>''lng''), '''')::double precision;
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  UNIQUE (shop_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_shop_memberships_shop
  ON customer_shop_memberships(shop_id, customer_id)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  status TEXT NOT NULL,
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
  order_number TEXT NOT NULL,
  status TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cod',
  subtotal_minor BIGINT NOT NULL,
  delivery_fee_minor BIGINT NOT NULL DEFAULT 0,
  total_minor BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  notes TEXT,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_orders_shop_status_placed ON orders(shop_id, status, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_shop_customer_placed ON orders (shop_id, customer_id, placed_at DESC);

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
  entity_type TEXT NOT NULL CHECK (entity_type IN ('shop', 'product', 'picker')),
  entity_id UUID NOT NULL,
  media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_images_media_asset ON entity_images(media_asset_id);

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

ALTER TABLE categories FORCE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_items FORCE ROW LEVEL SECURITY;
ALTER TABLE shop_staff FORCE ROW LEVEL SECURITY;
ALTER TABLE carts FORCE ROW LEVEL SECURITY;
ALTER TABLE cart_items FORCE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE entity_images FORCE ROW LEVEL SECURITY;
