CREATE TABLE IF NOT EXISTS global_category_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_category_id UUID NOT NULL REFERENCES global_categories(id) ON DELETE CASCADE,
  media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT global_category_images_sort_order_chk CHECK (sort_order >= 0 AND sort_order < 6),
  CONSTRAINT global_category_images_gc_sort_uidx UNIQUE (global_category_id, sort_order),
  CONSTRAINT global_category_images_gc_asset_uidx UNIQUE (global_category_id, media_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_global_category_images_gc_sort
  ON global_category_images(global_category_id, sort_order);
