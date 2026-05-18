-- Ops-only: remove duplicate carts, keeping the newest per (shop_id, customer_id).
-- Run only after backup. Review counts before COMMIT.
-- Audit first:
--   SELECT shop_id, customer_id, COUNT(*) AS n FROM carts
--   GROUP BY shop_id, customer_id HAVING COUNT(*) > 1;

BEGIN;

DELETE FROM cart_items ci
 USING carts c
 JOIN (
   SELECT shop_id, customer_id, MAX(created_at) AS keep_created_at
     FROM carts
    GROUP BY shop_id, customer_id
   HAVING COUNT(*) > 1
 ) dup
  ON c.shop_id = dup.shop_id
 AND c.customer_id = dup.customer_id
 AND c.created_at < dup.keep_created_at
WHERE ci.cart_id = c.id;

DELETE FROM carts c
 USING (
   SELECT shop_id, customer_id, MAX(created_at) AS keep_created_at
     FROM carts
    GROUP BY shop_id, customer_id
   HAVING COUNT(*) > 1
 ) dup
WHERE c.shop_id = dup.shop_id
  AND c.customer_id = dup.customer_id
  AND c.created_at < dup.keep_created_at;

-- COMMIT;
