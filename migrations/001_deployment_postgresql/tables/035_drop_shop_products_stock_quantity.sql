-- Stock quantity is not part of the client storefront; drop legacy column on existing DBs.
ALTER TABLE shop_products DROP COLUMN IF EXISTS stock_quantity;
