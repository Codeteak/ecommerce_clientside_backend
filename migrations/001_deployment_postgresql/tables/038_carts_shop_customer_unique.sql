-- Phase 4.2: one cart per customer per shop.
-- Before applying in production, run audit (must return 0 rows):
--   SELECT shop_id, customer_id, COUNT(*) AS n FROM carts
--   GROUP BY shop_id, customer_id HAVING COUNT(*) > 1;
-- If duplicates exist, run scripts/ops/dedupe-duplicate-carts.sql (ops-reviewed) first.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'carts_shop_customer_unique'
  ) THEN
    ALTER TABLE carts
      ADD CONSTRAINT carts_shop_customer_unique UNIQUE (shop_id, customer_id);
  END IF;
END $$;
