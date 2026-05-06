CREATE TABLE IF NOT EXISTS global_product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_product_id UUID NOT NULL REFERENCES global_products(id) ON DELETE CASCADE,
  media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  sort_order SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT global_product_images_sort_order_chk CHECK (sort_order >= 0 AND sort_order < 6),
  CONSTRAINT global_product_images_gp_sort_uidx UNIQUE (global_product_id, sort_order),
  CONSTRAINT global_product_images_gp_asset_uidx UNIQUE (global_product_id, media_asset_id)
);
