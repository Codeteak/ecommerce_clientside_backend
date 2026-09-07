-- Delivery tracking URL and Yaadro DMS order id (shared orders table with admin backend).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_tracking_url TEXT,
  ADD COLUMN IF NOT EXISTS yadro_order_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_shop_yadro_order_id
  ON orders (shop_id, yadro_order_id)
  WHERE yadro_order_id IS NOT NULL;
