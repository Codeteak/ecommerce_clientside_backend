CREATE TABLE IF NOT EXISTS shop_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  global_product_id UUID NOT NULL REFERENCES global_products(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  availability TEXT NOT NULL DEFAULT 'in_stock'
    CHECK (availability IN ('in_stock', 'out_of_stock', 'unknown')),
  price_minor_per_unit BIGINT NOT NULL,
  offer_price_minor_per_unit BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, global_product_id)
);
