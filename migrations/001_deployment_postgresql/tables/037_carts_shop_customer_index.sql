-- Phase 4.1: cart lookup by (shop_id, customer_id) — used on every cart GET and checkout.
-- Production on large tables: prefer running outside migrate transaction:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_carts_shop_customer ON carts (shop_id, customer_id);
-- Verify: EXPLAIN (ANALYZE, BUFFERS)
--   SELECT id FROM carts WHERE shop_id = $1::uuid AND customer_id = $2 LIMIT 1;
-- Expect: Index Scan using idx_carts_shop_customer.

CREATE INDEX IF NOT EXISTS idx_carts_shop_customer
  ON carts (shop_id, customer_id);
