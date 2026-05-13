CREATE TABLE IF NOT EXISTS promotion_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  shop_product_id UUID NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  promo_price_minor_per_unit BIGINT NOT NULL CHECK (promo_price_minor_per_unit >= 0),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (promotion_id, shop_product_id)
);

CREATE INDEX IF NOT EXISTS idx_promotion_products_shop_product
  ON promotion_products (shop_id, shop_product_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_promotion_products_promotion
  ON promotion_products (shop_id, promotion_id)
  WHERE is_deleted = false;
