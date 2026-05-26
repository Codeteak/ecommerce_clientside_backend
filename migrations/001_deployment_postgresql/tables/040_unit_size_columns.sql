-- Pack/unit multiplier on catalog products; snapshotted on cart and order lines.

ALTER TABLE global_products
  ADD COLUMN IF NOT EXISTS unit_size NUMERIC(18, 4) NOT NULL DEFAULT 1;

ALTER TABLE global_products
  DROP CONSTRAINT IF EXISTS global_products_unit_size_chk;

ALTER TABLE global_products
  ADD CONSTRAINT global_products_unit_size_chk CHECK (unit_size > 0);

ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS unit_size_snapshot NUMERIC(18, 4) NOT NULL DEFAULT 1;

ALTER TABLE cart_items
  DROP CONSTRAINT IF EXISTS cart_items_unit_size_snapshot_chk;

ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_unit_size_snapshot_chk CHECK (unit_size_snapshot > 0);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS unit_size_snapshot NUMERIC(18, 4) NOT NULL DEFAULT 1;

ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_unit_size_snapshot_chk;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_unit_size_snapshot_chk CHECK (unit_size_snapshot > 0);
