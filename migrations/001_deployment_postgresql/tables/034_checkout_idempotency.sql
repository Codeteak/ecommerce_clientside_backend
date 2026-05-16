-- Safe checkout retries: map (shop, customer, idempotency_key) -> order_id.
CREATE TABLE IF NOT EXISTS checkout_idempotency (
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, customer_id, idempotency_key),
  CONSTRAINT checkout_idempotency_key_len_chk
    CHECK (char_length(idempotency_key) >= 8 AND char_length(idempotency_key) <= 128)
);

CREATE INDEX IF NOT EXISTS idx_checkout_idempotency_order_id
  ON checkout_idempotency (order_id);

ALTER TABLE checkout_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checkout_idempotency_tenant_isolation ON checkout_idempotency;
CREATE POLICY checkout_idempotency_tenant_isolation ON checkout_idempotency
USING (shop_id = app.current_shop_uuid())
WITH CHECK (shop_id = app.current_shop_uuid());
