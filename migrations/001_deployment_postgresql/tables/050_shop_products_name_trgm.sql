-- Trigram indexes for shop_products name/slug (storefront contains search).
-- Complements 039_pg_trgm_product_search.sql (global_products).
-- Requires CREATE EXTENSION privilege. Idempotent.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_shop_products_name_trgm
  ON shop_products USING gin (name gin_trgm_ops)
  WHERE name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shop_products_slug_trgm
  ON shop_products USING gin (slug gin_trgm_ops)
  WHERE slug IS NOT NULL;
