-- Billing stock count used for product quantity.
ALTER TABLE shop_products
  ADD COLUMN IF NOT EXISTS stock_quantity NUMERIC(14, 3);
