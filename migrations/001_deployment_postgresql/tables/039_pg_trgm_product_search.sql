-- Phase 4.3b (ops-approved): trigram indexes for substring product name search.
-- Requires CREATE EXTENSION privilege. Skip this file in environments that disallow extensions.
-- Production: create indexes with CONCURRENTLY outside a transaction if needed.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_global_products_name_trgm
  ON global_products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_global_products_slug_trgm
  ON global_products USING gin (slug gin_trgm_ops);
