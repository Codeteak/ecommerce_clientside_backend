-- Storefront tables dropped from the admin schema; recreate for customer cart/checkout.
CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'carts_shop_customer_unique'
  ) THEN
    ALTER TABLE carts
      ADD CONSTRAINT carts_shop_customer_unique UNIQUE (shop_id, customer_id);
  END IF;
END $$;

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

CREATE TABLE IF NOT EXISTS checkout_idempotency (
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  cart_id UUID REFERENCES carts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, customer_id, idempotency_key),
  CONSTRAINT checkout_idempotency_key_len_chk
    CHECK (char_length(idempotency_key) >= 8 AND char_length(idempotency_key) <= 128)
);

CREATE INDEX IF NOT EXISTS idx_checkout_idempotency_order_id
  ON checkout_idempotency (order_id);

CREATE INDEX IF NOT EXISTS idx_checkout_idempotency_cart_id
  ON checkout_idempotency (cart_id)
  WHERE cart_id IS NOT NULL;
