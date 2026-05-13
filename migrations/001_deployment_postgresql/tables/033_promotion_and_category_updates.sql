-- Backfill old category bindings from `entity_images` into new layered tables.
INSERT INTO global_category_images (id, global_category_id, media_asset_id, sort_order, created_at, updated_at)
SELECT
  gen_random_uuid(),
  c.id,
  e.media_asset_id,
  0,
  e.created_at,
  e.updated_at
FROM entity_images e
JOIN global_categories c ON c.id = e.entity_id
WHERE e.entity_type = 'category'
  AND c.scope = 'shared'
ON CONFLICT (global_category_id, sort_order) DO NOTHING;

INSERT INTO shop_category_images (id, shop_id, global_category_id, media_asset_id, sort_order, created_at, updated_at)
SELECT
  gen_random_uuid(),
  e.shop_id,
  c.id,
  e.media_asset_id,
  0,
  e.created_at,
  e.updated_at
FROM entity_images e
JOIN global_categories c ON c.id = e.entity_id
WHERE e.entity_type = 'category'
  AND c.scope = 'private'
  AND c.owner_shop_id = e.shop_id
ON CONFLICT (shop_id, global_category_id, sort_order) DO NOTHING;

-- Resolve shop_staff by globally unique staff_login_code when HTTP request has no shop context.
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
  JOIN shops sh ON sh.id = s.shop_id
    AND sh.is_active = true
    AND sh.is_blocked = false
    AND sh.is_deleted = false
    AND sh.status = 'active'
  WHERE s.is_active = true
    AND s.is_blocked = false
    AND s.is_deleted = false
    AND s.status = 'active'
    AND u.is_active = true
    AND u.staff_login_code = p_code
    AND s.role <> 'picker';
$$;

-- Cross-shop catalog image reuse.
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
    SELECT x.media_asset_id INTO v_id
    FROM (
      SELECT gci.media_asset_id, gci.updated_at, 0 AS pri
      FROM global_category_images gci
      JOIN global_categories c ON c.id = gci.global_category_id
      WHERE lower(c.slug) = v_norm
        AND (c.scope = 'shared' OR c.owner_shop_id = app.current_shop_uuid())

      UNION ALL

      SELECT sci.media_asset_id, sci.updated_at, 1 AS pri
      FROM shop_category_images sci
      JOIN global_categories c ON c.id = sci.global_category_id
      WHERE lower(c.slug) = v_norm
        AND sci.shop_id = app.current_shop_uuid()
        AND c.scope = 'private'
        AND c.owner_shop_id = sci.shop_id

      UNION ALL

      -- Legacy fallback during migration window.
      SELECT e.media_asset_id, e.updated_at, 2 AS pri
      FROM entity_images e
      JOIN global_categories c ON c.id = e.entity_id
      WHERE e.entity_type = 'category'
        AND lower(c.slug) = v_norm
        AND (c.scope = 'shared' OR e.shop_id = app.current_shop_uuid())
    ) x
    ORDER BY x.pri ASC, x.updated_at DESC NULLS LAST
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
    AND c.relname = 'global_category_images'
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

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promotion_discount_total_minor BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS applied_promotion_ids JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code_normalized TEXT;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS list_price_minor BIGINT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_discount_minor BIGINT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS applied_promotion_ids JSONB;

ALTER TABLE global_category_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_category_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_promotion_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_bundle_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS global_category_images_tenant_isolation ON global_category_images;
CREATE POLICY global_category_images_tenant_isolation ON global_category_images
USING (
  EXISTS (
    SELECT 1
    FROM global_categories gc
    WHERE gc.id = global_category_images.global_category_id
      AND (gc.scope = 'shared' OR gc.owner_shop_id = app.current_shop_uuid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM global_categories gc
    WHERE gc.id = global_category_images.global_category_id
      AND (gc.scope = 'shared' OR gc.owner_shop_id = app.current_shop_uuid())
  )
);

DROP POLICY IF EXISTS shop_category_images_tenant_isolation ON shop_category_images;
CREATE POLICY shop_category_images_tenant_isolation ON shop_category_images
USING (
  shop_id = app.current_shop_uuid()
  AND EXISTS (
    SELECT 1
    FROM global_categories gc
    WHERE gc.id = shop_category_images.global_category_id
      AND gc.scope = 'private'
      AND gc.owner_shop_id = app.current_shop_uuid()
  )
)
WITH CHECK (
  shop_id = app.current_shop_uuid()
  AND EXISTS (
    SELECT 1
    FROM global_categories gc
    WHERE gc.id = shop_category_images.global_category_id
      AND gc.scope = 'private'
      AND gc.owner_shop_id = app.current_shop_uuid()
  )
);

DROP POLICY IF EXISTS shop_promotion_settings_tenant_isolation ON shop_promotion_settings;
CREATE POLICY shop_promotion_settings_tenant_isolation ON shop_promotion_settings
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS promotions_tenant_isolation ON promotions;
CREATE POLICY promotions_tenant_isolation ON promotions
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS promotion_products_tenant_isolation ON promotion_products;
CREATE POLICY promotion_products_tenant_isolation ON promotion_products
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS promotion_rules_tenant_isolation ON promotion_rules;
CREATE POLICY promotion_rules_tenant_isolation ON promotion_rules
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS promotion_bundle_rules_tenant_isolation ON promotion_bundle_rules;
CREATE POLICY promotion_bundle_rules_tenant_isolation ON promotion_bundle_rules
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS promotion_coupons_tenant_isolation ON promotion_coupons;
CREATE POLICY promotion_coupons_tenant_isolation ON promotion_coupons
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

DROP POLICY IF EXISTS promotion_redemptions_tenant_isolation ON promotion_redemptions;
CREATE POLICY promotion_redemptions_tenant_isolation ON promotion_redemptions
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());

ALTER TABLE global_category_images FORCE ROW LEVEL SECURITY;
ALTER TABLE shop_category_images FORCE ROW LEVEL SECURITY;
ALTER TABLE shop_promotion_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE promotions FORCE ROW LEVEL SECURITY;
ALTER TABLE promotion_products FORCE ROW LEVEL SECURITY;
ALTER TABLE promotion_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE promotion_bundle_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE promotion_coupons FORCE ROW LEVEL SECURITY;
ALTER TABLE promotion_redemptions FORCE ROW LEVEL SECURITY;
