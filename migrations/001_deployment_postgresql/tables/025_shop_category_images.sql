CREATE TABLE IF NOT EXISTS shop_category_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  global_category_id UUID NOT NULL REFERENCES global_categories(id) ON DELETE CASCADE,
  media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shop_category_images_sort_order_chk CHECK (sort_order >= 0 AND sort_order < 6),
  CONSTRAINT shop_category_images_sc_sort_uidx UNIQUE (shop_id, global_category_id, sort_order),
  CONSTRAINT shop_category_images_sc_asset_uidx UNIQUE (shop_id, global_category_id, media_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_category_images_sc_sort
  ON shop_category_images(shop_id, global_category_id, sort_order);
