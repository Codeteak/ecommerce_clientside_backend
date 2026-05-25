-- Shop branding for GET /api/shops/resolve-by-domain?domain=marketfresh.in
--
-- Tables: shops (domain/custom_domain), media_assets (storage_key), entity_images (entity_type = 'shop')
-- Targets the shop that already owns the domain in DB; inserts a demo shop only if none exists.

DO $$
DECLARE
  v_domain text := 'marketfresh.in';
  v_shop_id uuid;
  v_media_id uuid := 'a1111111-1111-4111-8111-111111111102';
  v_entity_image_id uuid := 'a1111111-1111-4111-8111-111111111103';
  v_demo_shop_id uuid := 'a1111111-1111-4111-8111-111111111101';
  v_storage_key text := 'shops/marketfresh-demo/logo.png';
BEGIN
  SELECT id
    INTO v_shop_id
    FROM shops
   WHERE lower(coalesce(domain, '')) = v_domain
      OR lower(coalesce(custom_domain, '')) = v_domain
   LIMIT 1;

  IF v_shop_id IS NULL THEN
    INSERT INTO shops (
      id,
      public_id,
      slug,
      name,
      domain,
      custom_domain,
      status,
      is_active,
      is_blocked,
      is_deleted
    )
    VALUES (
      v_demo_shop_id,
      'marketfresh-demo',
      'marketfresh-demo',
      'Market Fresh Demo',
      v_domain,
      NULL,
      'active',
      true,
      false,
      false
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      domain = EXCLUDED.domain,
      updated_at = now();
    v_shop_id := v_demo_shop_id;
  ELSE
    UPDATE shops
       SET name = CASE
             WHEN trim(coalesce(name, '')) = '' THEN 'Market Fresh'
             ELSE name
           END,
           updated_at = now()
     WHERE id = v_shop_id;
  END IF;

  INSERT INTO media_assets (id, sha256, storage_key, content_type, byte_size)
  VALUES (
    v_media_id,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    v_storage_key,
    'image/png',
    1024
  )
  ON CONFLICT (storage_key) DO UPDATE SET
    content_type = EXCLUDED.content_type,
    byte_size = EXCLUDED.byte_size;

  SELECT id INTO v_media_id FROM media_assets WHERE storage_key = v_storage_key LIMIT 1;

  INSERT INTO entity_images (id, shop_id, entity_type, entity_id, media_asset_id)
  VALUES (v_entity_image_id, v_shop_id, 'shop', v_shop_id, v_media_id)
  ON CONFLICT (shop_id, entity_type, entity_id) DO UPDATE SET
    media_asset_id = EXCLUDED.media_asset_id,
    updated_at = now();
END $$;
