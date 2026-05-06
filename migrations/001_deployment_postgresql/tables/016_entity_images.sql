CREATE TABLE IF NOT EXISTS entity_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CONSTRAINT entity_images_entity_type_check
    CHECK (entity_type IN ('shop', 'picker', 'category')),
  entity_id UUID NOT NULL,
  media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, entity_type, entity_id)
);

-- ---------------------------------------------------------------------------
-- Global catalog core + shop overlay (fresh-install baseline)
-- ---------------------------------------------------------------------------
