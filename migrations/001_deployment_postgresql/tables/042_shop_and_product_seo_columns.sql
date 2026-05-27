-- Shop + product SEO columns (nullable). Application logic in a follow-up change.

ALTER TABLE shops ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS seo_keywords TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS tagline TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'en_IN';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS theme_color TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS og_image_storage_key TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS og_image_alt TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS twitter_card TEXT DEFAULT 'summary_large_image';

ALTER TABLE global_products ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE global_products ADD COLUMN IF NOT EXISTS seo_description TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_seo_title_len_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_seo_title_len_chk
      CHECK (seo_title IS NULL OR char_length(seo_title) <= 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_seo_description_len_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_seo_description_len_chk
      CHECK (seo_description IS NULL OR char_length(seo_description) <= 512);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_seo_keywords_len_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_seo_keywords_len_chk
      CHECK (seo_keywords IS NULL OR char_length(seo_keywords) <= 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_tagline_len_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_tagline_len_chk
      CHECK (tagline IS NULL OR char_length(tagline) <= 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_locale_len_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_locale_len_chk
      CHECK (locale IS NULL OR char_length(locale) <= 16);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_theme_color_format_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_theme_color_format_chk
      CHECK (theme_color IS NULL OR theme_color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_twitter_card_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_twitter_card_chk
      CHECK (
        twitter_card IS NULL
        OR twitter_card IN ('summary', 'summary_large_image', 'app', 'player')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_og_image_alt_len_chk') THEN
    ALTER TABLE shops
      ADD CONSTRAINT shops_og_image_alt_len_chk
      CHECK (og_image_alt IS NULL OR char_length(og_image_alt) <= 200);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'global_products_seo_title_len_chk') THEN
    ALTER TABLE global_products
      ADD CONSTRAINT global_products_seo_title_len_chk
      CHECK (seo_title IS NULL OR char_length(seo_title) <= 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'global_products_seo_description_len_chk') THEN
    ALTER TABLE global_products
      ADD CONSTRAINT global_products_seo_description_len_chk
      CHECK (seo_description IS NULL OR char_length(seo_description) <= 512);
  END IF;
END $$;
