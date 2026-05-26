CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id UUID,
  title_snapshot TEXT NOT NULL,
  quantity NUMERIC(18, 4) NOT NULL,
  unit_size_snapshot NUMERIC(18, 4) NOT NULL DEFAULT 1,
  unit_label TEXT NOT NULL,
  unit_price_minor BIGINT NOT NULL,
  is_custom BOOLEAN NOT NULL DEFAULT false,
  custom_note TEXT
);
