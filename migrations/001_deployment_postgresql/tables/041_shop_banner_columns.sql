-- Shop homepage banner: toggle and up to six media_asset UUIDs.

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS banner_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS banner_media_asset_ids UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE shops
  DROP CONSTRAINT IF EXISTS shops_banner_media_asset_ids_max_chk;

ALTER TABLE shops
  ADD CONSTRAINT shops_banner_media_asset_ids_max_chk
  CHECK (cardinality(banner_media_asset_ids) <= 6);
