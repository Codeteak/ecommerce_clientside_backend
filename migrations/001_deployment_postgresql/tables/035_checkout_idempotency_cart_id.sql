-- Record which cart was checked out for idempotency rows (replay still keyed by shop + customer + idempotency_key).
ALTER TABLE checkout_idempotency
  ADD COLUMN IF NOT EXISTS cart_id UUID REFERENCES carts (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_checkout_idempotency_cart_id
  ON checkout_idempotency (cart_id)
  WHERE cart_id IS NOT NULL;
