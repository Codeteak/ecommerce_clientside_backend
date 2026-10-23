-- Shop-level minimum payable goods total (paise). 0 = no minimum.
-- Superadmin-owned; delivery fee does not count toward the floor.

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS min_purchase_minor BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shops_min_purchase_minor_chk'
  ) THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_min_purchase_minor_chk
      CHECK (min_purchase_minor >= 0);
  END IF;
END $$;
