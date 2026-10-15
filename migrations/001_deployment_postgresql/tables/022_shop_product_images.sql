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

-- ---------------------------------------------------------------------------
-- Incremental additions from updated deployment migration (kept idempotent)
-- ---------------------------------------------------------------------------

-- Upgrade: picker self-manage order policy flag.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS picker_self_manage_orders BOOLEAN NOT NULL DEFAULT false;

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
  IF to_regclass('public.shop_staff') IS NOT NULL THEN
    ALTER TABLE shop_staff ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE shop_staff ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE shop_staff ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE shop_staff ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE shop_staff ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE shop_staff ADD COLUMN IF NOT EXISTS device_push_token TEXT;
  END IF;

  IF to_regclass('public.customer_shop_memberships') IS NOT NULL THEN
    ALTER TABLE customer_shop_memberships ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE customer_shop_memberships ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE customer_shop_memberships ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE customer_shop_memberships ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  END IF;

  UPDATE shops
    SET is_blocked = (status = 'blocked'),
        is_deleted = (status = 'deleted')
    WHERE (is_blocked = false OR is_deleted = false)
      AND status IN ('blocked', 'deleted');

  UPDATE shops
    SET deleted_at = COALESCE(deleted_at, updated_at, now())
    WHERE is_deleted = true AND deleted_at IS NULL;

  ALTER TABLE shops ADD COLUMN IF NOT EXISTS address_id UUID;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_id UUID;

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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_staff_display_name_len_chk') THEN
    ALTER TABLE shop_staff
      ADD CONSTRAINT shop_staff_display_name_len_chk
      CHECK (display_name IS NULL OR char_length(display_name) <= 120);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_shop_memberships_shop
  ON customer_shop_memberships(shop_id, customer_id)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_customer_shop_memberships_shop_flags
  ON customer_shop_memberships(shop_id, is_deleted, is_blocked, is_active, customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_created_at_desc
  ON customers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);

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

DO $$
DECLARE
  v_batch_size integer := 5000;
  v_rows integer := 0;
BEGIN
  LOOP
    WITH target AS (
      SELECT o.ctid, o.customer_id
      FROM orders o
      WHERE o.customer_name IS NULL OR o.customer_phone IS NULL OR o.customer_address IS NULL
      LIMIT v_batch_size
    ),
    snapshot AS (
      SELECT
        t.ctid,
        c.display_name AS customer_name,
        u.phone AS customer_phone,
        NULLIF(
          COALESCE(a.raw, CONCAT_WS(', ', a.line1, a.line2, a.landmark, a.city, a.state, a.postal_code, a.country)),
          ''
        ) AS customer_address
      FROM target t
      LEFT JOIN customers c ON c.user_id::text = t.customer_id
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN addresses a ON a.id = c.address_id
    )
    UPDATE orders o
    SET
      customer_name = COALESCE(o.customer_name, s.customer_name),
      customer_phone = COALESCE(o.customer_phone, s.customer_phone),
      customer_address = COALESCE(o.customer_address, s.customer_address)
    FROM snapshot s
    WHERE s.ctid = o.ctid
      AND (
        (o.customer_name IS NULL AND s.customer_name IS NOT NULL)
        OR (o.customer_phone IS NULL AND s.customer_phone IS NOT NULL)
        OR (o.customer_address IS NULL AND s.customer_address IS NOT NULL)
      );

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    EXIT WHEN v_rows = 0;
  END LOOP;
END $$;

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

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_active ON order_items(order_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_outbox_messages_pending_created
  ON outbox_messages (created_at)
  WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entity_images_media_asset ON entity_images(media_asset_id);

ALTER TABLE entity_images DROP CONSTRAINT IF EXISTS entity_images_entity_type_check;
ALTER TABLE entity_images
  ADD CONSTRAINT entity_images_entity_type_check
  CHECK (entity_type IN ('shop', 'picker', 'category'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'global_categories_scope_owner_chk') THEN
    ALTER TABLE global_categories
      ADD CONSTRAINT global_categories_scope_owner_chk
      CHECK (
        (scope = 'shared' AND owner_shop_id IS NULL)
        OR (scope = 'private' AND owner_shop_id IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'global_brands_scope_owner_chk') THEN
    ALTER TABLE global_brands
      ADD CONSTRAINT global_brands_scope_owner_chk
      CHECK (
        (scope = 'shared' AND owner_shop_id IS NULL)
        OR (scope = 'private' AND owner_shop_id IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'global_products_scope_owner_chk') THEN
    ALTER TABLE global_products
      ADD CONSTRAINT global_products_scope_owner_chk
      CHECK (
        (scope = 'shared' AND owner_shop_id IS NULL)
        OR (scope = 'private' AND owner_shop_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_global_categories_slug_scope_owner
  ON global_categories(scope, owner_shop_id, slug);
CREATE INDEX IF NOT EXISTS idx_global_categories_parent
  ON global_categories(parent_id, sort_order, name);
CREATE INDEX IF NOT EXISTS idx_global_categories_name
  ON global_categories(lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_global_brands_name_scope_owner
  ON global_brands(scope, owner_shop_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_global_brands_name_active
  ON global_brands(lower(name))
  WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_global_products_slug_scope_owner
  ON global_products(scope, owner_shop_id, slug);
CREATE INDEX IF NOT EXISTS idx_global_products_name
  ON global_products(lower(name));
CREATE INDEX IF NOT EXISTS idx_global_products_code
  ON global_products(code_type, code)
  WHERE code IS NOT NULL AND code <> '';
CREATE INDEX IF NOT EXISTS idx_global_products_upc
  ON global_products(upc)
  WHERE upc IS NOT NULL AND upc <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_global_products_shared_code
  ON global_products(code_type, code)
  WHERE scope = 'shared' AND code IS NOT NULL AND code <> '' AND code_type IS NOT NULL AND code_type <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_global_products_shared_upc
  ON global_products(upc)
  WHERE scope = 'shared' AND upc IS NOT NULL AND upc <> '';
CREATE INDEX IF NOT EXISTS idx_global_products_shared_category_created
  ON global_products (global_category_id, created_at DESC)
  WHERE scope = 'shared';
CREATE INDEX IF NOT EXISTS idx_shop_products_shop_status_created
  ON shop_products(shop_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_products_shop_availability
  ON shop_products(shop_id, availability);
CREATE INDEX IF NOT EXISTS idx_shop_products_shop_global
  ON shop_products(shop_id, global_product_id);
CREATE INDEX IF NOT EXISTS idx_global_product_images_gp_sort
  ON global_product_images(global_product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_shop_product_images_sp_sort
  ON shop_product_images(shop_product_id, sort_order);

ALTER TABLE shop_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_product_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS global_categories_tenant_isolation ON global_categories;
CREATE POLICY global_categories_tenant_isolation ON global_categories
USING (scope = 'shared' OR owner_shop_id = app.current_shop_uuid())
WITH CHECK (scope = 'shared' OR owner_shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS global_brands_tenant_isolation ON global_brands;
CREATE POLICY global_brands_tenant_isolation ON global_brands
USING (scope = 'shared' OR owner_shop_id = app.current_shop_uuid())
WITH CHECK (scope = 'shared' OR owner_shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS global_products_tenant_isolation ON global_products;
CREATE POLICY global_products_tenant_isolation ON global_products
USING (scope = 'shared' OR owner_shop_id = app.current_shop_uuid())
WITH CHECK (scope = 'shared' OR owner_shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS shop_products_tenant_isolation ON shop_products;
CREATE POLICY shop_products_tenant_isolation ON shop_products
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS global_product_images_tenant_isolation ON global_product_images;
CREATE POLICY global_product_images_tenant_isolation ON global_product_images
USING (
  EXISTS (
    SELECT 1
    FROM global_products gp
    WHERE gp.id = global_product_images.global_product_id
      AND (gp.scope = 'shared' OR gp.owner_shop_id = app.current_shop_uuid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM global_products gp
    WHERE gp.id = global_product_images.global_product_id
      AND (gp.scope = 'shared' OR gp.owner_shop_id = app.current_shop_uuid())
  )
);

DROP POLICY IF EXISTS shop_product_images_tenant_isolation ON shop_product_images;
CREATE POLICY shop_product_images_tenant_isolation ON shop_product_images
USING (
  EXISTS (
    SELECT 1
    FROM shop_products sp
    WHERE sp.id = shop_product_images.shop_product_id
      AND sp.shop_id = app.current_shop_uuid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM shop_products sp
    WHERE sp.id = shop_product_images.shop_product_id
      AND sp.shop_id = app.current_shop_uuid()
  )
);

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

ALTER TABLE shop_staff FORCE ROW LEVEL SECURITY;
ALTER TABLE carts FORCE ROW LEVEL SECURITY;
ALTER TABLE cart_items FORCE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE entity_images FORCE ROW LEVEL SECURITY;
ALTER TABLE global_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE global_brands FORCE ROW LEVEL SECURITY;
ALTER TABLE global_products FORCE ROW LEVEL SECURITY;
ALTER TABLE shop_products FORCE ROW LEVEL SECURITY;
ALTER TABLE global_product_images FORCE ROW LEVEL SECURITY;
ALTER TABLE shop_product_images FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_shop_products_shop_availability_created
  ON shop_products (shop_id, availability, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_global_products_name_lower
  ON global_products (lower(name));
CREATE INDEX IF NOT EXISTS idx_global_categories_name_lower
  ON global_categories (lower(name));

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
  v_global_pid uuid;
  v_ids uuid[];
BEGIN
  IF v_norm = '' THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT wc.global_product_id INTO v_global_pid
  FROM (
    SELECT gp.id AS global_product_id,
           COUNT(gpi.id) AS image_cnt,
           MAX(gpi.updated_at) AS gallery_max_updated
    FROM global_products gp
    JOIN global_product_images gpi ON gpi.global_product_id = gp.id
    WHERE lower(gp.slug) = v_norm
    GROUP BY gp.id
  ) wc
  ORDER BY wc.image_cnt DESC, wc.gallery_max_updated DESC NULLS LAST, wc.global_product_id ASC
  LIMIT 1;

  IF v_global_pid IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT array_agg(sub.media_asset_id ORDER BY sub.sort_order)
  INTO v_ids
  FROM (
    SELECT gpi.media_asset_id, gpi.sort_order
    FROM global_product_images gpi
    WHERE gpi.global_product_id = v_global_pid
    ORDER BY gpi.sort_order ASC
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
    AND c.relname = 'global_product_images'
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
  v_global_pid uuid;
  v_ids uuid[];
BEGIN
  IF v_norm = '' OR p_shop_id IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT wc.global_product_id INTO v_global_pid
  FROM (
    SELECT gp.id AS global_product_id,
           COUNT(gpi.id) AS image_cnt,
           MAX(gpi.updated_at) AS gallery_max_updated
    FROM global_products gp
    JOIN global_product_images gpi ON gpi.global_product_id = gp.id
    WHERE lower(gp.slug) = v_norm
      AND (gp.scope = 'shared' OR (gp.scope = 'private' AND gp.owner_shop_id = p_shop_id))
    GROUP BY gp.id
  ) wc
  ORDER BY wc.image_cnt DESC, wc.gallery_max_updated DESC NULLS LAST, wc.global_product_id ASC
  LIMIT 1;

  IF v_global_pid IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT array_agg(sub.media_asset_id ORDER BY sub.sort_order)
  INTO v_ids
  FROM (
    SELECT gpi.media_asset_id, gpi.sort_order
    FROM global_product_images gpi
    WHERE gpi.global_product_id = v_global_pid
    ORDER BY gpi.sort_order ASC
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
    AND c.relname = 'global_product_images'
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
  IF v_norm = '' OR p_entity_type NOT IN ('category', 'product') THEN
    RETURN NULL;
  END IF;
  IF p_entity_type = 'category' THEN
    SELECT m.id INTO v_id
    FROM entity_images e
    JOIN media_assets m ON m.id = e.media_asset_id
    JOIN global_categories c ON c.id = e.entity_id
    WHERE e.entity_type = 'category'
      AND lower(c.slug) = v_norm
    ORDER BY e.updated_at DESC NULLS LAST
    LIMIT 1;
    RETURN v_id;
  END IF;
  v_gallery := app.find_fallback_product_gallery_ids_by_slug(p_slug);
  IF v_gallery IS NOT NULL AND cardinality(v_gallery) >= 1 THEN
    RETURN v_gallery[1];
  END IF;
  RETURN NULL;
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
          gpi.media_asset_id,
          ROW_NUMBER() OVER (
            ORDER BY gp.updated_at DESC NULLS LAST, gpi.sort_order ASC, gp.id, gpi.id
          ) AS global_ord
        FROM global_product_images gpi
        INNER JOIN global_products gp ON gp.id = gpi.global_product_id
        WHERE lower(gp.slug) = v_norm
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
    AND c.relname = 'global_product_images'
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
