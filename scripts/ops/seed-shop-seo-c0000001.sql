-- Sample SEO fields for shop c0000001-0000-4000-8000-000000000001 (dev/test shop).
-- Idempotent: safe to re-run.

UPDATE shops
   SET seo_title = 'GreenLeaf Fresh Mart – Online Grocery',
       seo_description = 'Fresh groceries delivered to your door. Order vegetables, dairy, and daily essentials from GreenLeaf Fresh Mart.',
       seo_keywords = 'grocery, delivery, greenleaf, online supermarket',
       tagline = 'Fresh every day',
       locale = 'en_IN',
       theme_color = '#FF8D21',
       og_image_storage_key = 'shops/greenleaf/og-share.jpg',
       og_image_alt = 'GreenLeaf Fresh Mart storefront',
       twitter_card = 'summary_large_image',
       updated_at = now()
 WHERE id = 'c0000001-0000-4000-8000-000000000001'::uuid;

-- Optional: OG image asset for og_image_storage_key (skip if you manage media elsewhere)
INSERT INTO media_assets (id, sha256, storage_key, content_type, byte_size)
VALUES (
  'b1111111-1111-4111-8111-111111111201',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'shops/greenleaf/og-share.jpg',
  'image/jpeg',
  2048
)
ON CONFLICT (id) DO UPDATE SET
  storage_key = EXCLUDED.storage_key,
  content_type = EXCLUDED.content_type,
  byte_size = EXCLUDED.byte_size;
