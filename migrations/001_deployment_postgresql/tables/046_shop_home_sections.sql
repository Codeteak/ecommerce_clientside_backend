-- Staff-managed home shelves (shared with admin). Storefront reads enabled rows only.

CREATE TABLE IF NOT EXISTS shop_home_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('product_shelf', 'event_shelf', 'buy_x_get_y')),
  sort_order INT NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  product_ids UUID[] NOT NULL DEFAULT ARRAY[]::uuid[],
  category_ids UUID[] NOT NULL DEFAULT ARRAY[]::uuid[],
  buy_product_ids UUID[] NOT NULL DEFAULT ARRAY[]::uuid[],
  get_product_ids UUID[] NOT NULL DEFAULT ARRAY[]::uuid[],
  buy_qty INT,
  get_qty INT,
  promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT shop_home_sections_product_ids_max_chk CHECK (cardinality(product_ids) <= 50),
  CONSTRAINT shop_home_sections_category_ids_max_chk CHECK (cardinality(category_ids) <= 20),
  CONSTRAINT shop_home_sections_buy_product_ids_max_chk CHECK (cardinality(buy_product_ids) <= 50),
  CONSTRAINT shop_home_sections_get_product_ids_max_chk CHECK (cardinality(get_product_ids) <= 50)
);

CREATE INDEX IF NOT EXISTS idx_shop_home_sections_shop_sort
  ON shop_home_sections (shop_id, sort_order)
  WHERE deleted_at IS NULL;

ALTER TABLE shop_home_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_home_sections FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shop_home_sections'
      AND policyname = 'shop_home_sections_tenant_isolation'
  ) THEN
    CREATE POLICY shop_home_sections_tenant_isolation ON shop_home_sections
      USING (shop_id = app.current_shop_uuid())
      WITH CHECK (shop_id = app.current_shop_uuid());
  END IF;
END $$;
