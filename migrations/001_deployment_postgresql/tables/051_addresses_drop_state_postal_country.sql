-- Drop unused address location columns (city/line fields remain in raw JSON).
-- Idempotent.

ALTER TABLE addresses
  DROP COLUMN IF EXISTS state,
  DROP COLUMN IF EXISTS postal_code,
  DROP COLUMN IF EXISTS country;
