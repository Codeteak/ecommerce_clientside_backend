CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID,
  product_name_snapshot TEXT NOT NULL,
  unit_label_snapshot TEXT NOT NULL,
  quantity NUMERIC(18, 4) NOT NULL,
  unit_size_snapshot NUMERIC(18, 4) NOT NULL DEFAULT 1,
  unit_price_minor_snapshot BIGINT NOT NULL,
  line_total_minor BIGINT NOT NULL,
  is_custom BOOLEAN NOT NULL DEFAULT false,
  custom_note TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  list_price_minor BIGINT,
  line_discount_minor BIGINT,
  applied_promotion_ids JSONB
);
