-- Locked default home sessions: Daily Diary, Festive, Offer Damaka.

ALTER TABLE shop_home_sections
  ADD COLUMN IF NOT EXISTS system_key TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_home_sections_shop_system_key
  ON shop_home_sections (shop_id, system_key)
  WHERE system_key IS NOT NULL AND deleted_at IS NULL;
