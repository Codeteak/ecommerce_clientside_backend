-- Per-shop hide of shared or private categories/brands (does not delete global rows).

CREATE TABLE IF NOT EXISTS shop_catalog_hides (
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('category', 'brand')),
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_catalog_hides_shop_type
  ON shop_catalog_hides (shop_id, entity_type);

ALTER TABLE shop_catalog_hides ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_catalog_hides FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shop_catalog_hides'
      AND policyname = 'shop_catalog_hides_tenant_isolation'
  ) THEN
    CREATE POLICY shop_catalog_hides_tenant_isolation ON shop_catalog_hides
      USING (shop_id = app.current_shop_uuid())
      WITH CHECK (shop_id = app.current_shop_uuid());
  END IF;
END $$;
