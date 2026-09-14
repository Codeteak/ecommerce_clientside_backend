-- System default home sessions: Daily Diary, Festive, Offer Damaka.
-- Seeds on every shop INSERT; backfills existing shops; enforces one Damaka BXGY shelf.

-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shop_home_sections_system_key_chk'
  ) THEN
    ALTER TABLE shop_home_sections
      ADD CONSTRAINT shop_home_sections_system_key_chk
      CHECK (
        system_key IS NULL
        OR system_key IN ('daily_diary', 'festive', 'offer_damaka')
      );
  END IF;
END $$;

ALTER TABLE shop_home_sections
  ADD COLUMN IF NOT EXISTS system_key TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_home_sections_shop_system_key
  ON shop_home_sections (shop_id, system_key)
  WHERE system_key IS NOT NULL AND deleted_at IS NULL;

-- (one-bxgy unique index created after duplicate cleanup below)

-- ---------------------------------------------------------------------------
-- Ensure defaults for one shop (idempotent). SECURITY DEFINER bypasses RLS.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.ensure_system_home_sections(p_shop_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
SET row_security = off
AS $$
DECLARE
  v_id uuid;
  v_damaka_id uuid;
BEGIN
  IF p_shop_id IS NULL THEN
    RAISE EXCEPTION 'shop_id is required';
  END IF;

  -- Daily Diary (product shelf)
  SELECT id INTO v_id
  FROM shop_home_sections
  WHERE shop_id = p_shop_id AND system_key = 'daily_diary' AND deleted_at IS NULL
  LIMIT 1;
  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM shop_home_sections
    WHERE shop_id = p_shop_id
      AND deleted_at IS NULL
      AND system_key IS NULL
      AND type = 'product_shelf'
      AND lower(trim(title)) = 'daily diary'
    ORDER BY sort_order ASC, created_at ASC
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE shop_home_sections
      SET system_key = 'daily_diary',
          title = 'Daily Diary',
          type = 'product_shelf',
          updated_at = now()
      WHERE id = v_id;
    ELSE
      INSERT INTO shop_home_sections (
        shop_id, title, type, sort_order, is_enabled,
        product_ids, category_ids, buy_product_ids, get_product_ids,
        buy_qty, get_qty, promotion_id, system_key
      ) VALUES (
        p_shop_id, 'Daily Diary', 'product_shelf', 0, true,
        ARRAY[]::uuid[], ARRAY[]::uuid[], ARRAY[]::uuid[], ARRAY[]::uuid[],
        NULL, NULL, NULL, 'daily_diary'
      );
    END IF;
  ELSE
    UPDATE shop_home_sections
    SET title = 'Daily Diary', type = 'product_shelf', updated_at = now()
    WHERE id = v_id
      AND (title IS DISTINCT FROM 'Daily Diary' OR type IS DISTINCT FROM 'product_shelf');
  END IF;

  -- Festive (event shelf)
  SELECT id INTO v_id
  FROM shop_home_sections
  WHERE shop_id = p_shop_id AND system_key = 'festive' AND deleted_at IS NULL
  LIMIT 1;
  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM shop_home_sections
    WHERE shop_id = p_shop_id
      AND deleted_at IS NULL
      AND system_key IS NULL
      AND type = 'event_shelf'
      AND lower(trim(title)) = 'festive'
    ORDER BY sort_order ASC, created_at ASC
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE shop_home_sections
      SET system_key = 'festive',
          title = 'Festive',
          type = 'event_shelf',
          updated_at = now()
      WHERE id = v_id;
    ELSE
      INSERT INTO shop_home_sections (
        shop_id, title, type, sort_order, is_enabled,
        product_ids, category_ids, buy_product_ids, get_product_ids,
        buy_qty, get_qty, promotion_id, system_key
      ) VALUES (
        p_shop_id, 'Festive', 'event_shelf', 1, true,
        ARRAY[]::uuid[], ARRAY[]::uuid[], ARRAY[]::uuid[], ARRAY[]::uuid[],
        NULL, NULL, NULL, 'festive'
      );
    END IF;
  ELSE
    UPDATE shop_home_sections
    SET title = 'Festive', type = 'event_shelf', updated_at = now()
    WHERE id = v_id
      AND (title IS DISTINCT FROM 'Festive' OR type IS DISTINCT FROM 'event_shelf');
  END IF;

  -- Offer Damaka (BXGY — promotions-owned)
  SELECT id INTO v_damaka_id
  FROM shop_home_sections
  WHERE shop_id = p_shop_id AND system_key = 'offer_damaka' AND deleted_at IS NULL
  LIMIT 1;
  IF v_damaka_id IS NULL THEN
    SELECT id INTO v_damaka_id
    FROM shop_home_sections
    WHERE shop_id = p_shop_id
      AND deleted_at IS NULL
      AND (
        system_key = 'offer_damaka'
        OR (system_key IS NULL AND type = 'buy_x_get_y')
        OR (system_key IS NULL AND lower(trim(title)) = 'offer damaka')
      )
    ORDER BY
      CASE WHEN system_key = 'offer_damaka' THEN 0
           WHEN lower(trim(title)) = 'offer damaka' THEN 1
           ELSE 2 END,
      sort_order ASC,
      created_at ASC
    LIMIT 1;
    IF v_damaka_id IS NOT NULL THEN
      UPDATE shop_home_sections
      SET system_key = 'offer_damaka',
          title = 'Offer Damaka',
          type = 'buy_x_get_y',
          promotion_id = NULL,
          buy_qty = COALESCE(buy_qty, 1),
          get_qty = COALESCE(get_qty, 1),
          updated_at = now()
      WHERE id = v_damaka_id;
    ELSE
      INSERT INTO shop_home_sections (
        shop_id, title, type, sort_order, is_enabled,
        product_ids, category_ids, buy_product_ids, get_product_ids,
        buy_qty, get_qty, promotion_id, system_key
      ) VALUES (
        p_shop_id, 'Offer Damaka', 'buy_x_get_y', 2, true,
        ARRAY[]::uuid[], ARRAY[]::uuid[], ARRAY[]::uuid[], ARRAY[]::uuid[],
        1, 1, NULL, 'offer_damaka'
      )
      RETURNING id INTO v_damaka_id;
    END IF;
  ELSE
    UPDATE shop_home_sections
    SET title = 'Offer Damaka',
        type = 'buy_x_get_y',
        promotion_id = NULL,
        updated_at = now()
    WHERE id = v_damaka_id
      AND (
        title IS DISTINCT FROM 'Offer Damaka'
        OR type IS DISTINCT FROM 'buy_x_get_y'
        OR promotion_id IS NOT NULL
      );
  END IF;

  -- Soft-delete any extra live BXGY shelves (Damaka is the only allowed one).
  UPDATE shop_home_sections
  SET deleted_at = now(), updated_at = now()
  WHERE shop_id = p_shop_id
    AND deleted_at IS NULL
    AND type = 'buy_x_get_y'
    AND id IS DISTINCT FROM v_damaka_id;
END;
$$;

COMMENT ON FUNCTION app.ensure_system_home_sections(uuid) IS
  'Idempotent seed/repair of Daily Diary, Festive, Offer Damaka for a shop.';

-- ---------------------------------------------------------------------------
-- Trigger: seed defaults when a shop is created
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.trg_shops_seed_system_home_sections()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
SET row_security = off
AS $$
BEGIN
  PERFORM app.ensure_system_home_sections(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shops_seed_system_home_sections ON shops;
CREATE TRIGGER trg_shops_seed_system_home_sections
  AFTER INSERT ON shops
  FOR EACH ROW
  EXECUTE PROCEDURE app.trg_shops_seed_system_home_sections();

-- ---------------------------------------------------------------------------
-- One-time cleanup + backfill for existing shops
-- (runs before row guards so duplicate system-keyed BXGY can be collapsed)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
  keep_id uuid;
BEGIN
  FOR r IN
    SELECT shop_id
    FROM shop_home_sections
    WHERE deleted_at IS NULL AND type = 'buy_x_get_y'
    GROUP BY shop_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keep_id
    FROM shop_home_sections
    WHERE shop_id = r.shop_id
      AND deleted_at IS NULL
      AND type = 'buy_x_get_y'
    ORDER BY
      CASE WHEN system_key = 'offer_damaka' THEN 0
           WHEN lower(trim(title)) = 'offer damaka' THEN 1
           ELSE 2 END,
      sort_order ASC,
      created_at ASC
    LIMIT 1;

    UPDATE shop_home_sections
    SET deleted_at = now(), updated_at = now()
    WHERE shop_id = r.shop_id
      AND deleted_at IS NULL
      AND type = 'buy_x_get_y'
      AND id IS DISTINCT FROM keep_id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_home_sections_one_bxgy_per_shop
  ON shop_home_sections (shop_id)
  WHERE type = 'buy_x_get_y' AND deleted_at IS NULL;

DO $$
DECLARE
  s RECORD;
BEGIN
  FOR s IN SELECT id FROM shops WHERE deleted_at IS NULL LOOP
    PERFORM app.ensure_system_home_sections(s.id);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Guards: no non-Damaka BXGY; system rows cannot be soft-deleted / rekeyed
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.trg_shop_home_sections_system_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.type = 'buy_x_get_y' AND NEW.system_key IS DISTINCT FROM 'offer_damaka' THEN
      RAISE EXCEPTION
        'Only the Offer Damaka system section may use buy_x_get_y. Create Buy X get Y under Promotions.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.system_key = 'offer_damaka' THEN
      NEW.title := 'Offer Damaka';
      NEW.type := 'buy_x_get_y';
      NEW.promotion_id := NULL;
    ELSIF NEW.system_key = 'daily_diary' THEN
      NEW.title := 'Daily Diary';
      NEW.type := 'product_shelf';
    ELSIF NEW.system_key = 'festive' THEN
      NEW.title := 'Festive';
      NEW.type := 'event_shelf';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.system_key IS NOT NULL
       AND OLD.deleted_at IS NULL
       AND NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION
        'Daily Diary, Festive, and Offer Damaka cannot be deleted. Turn the section Off to hide it.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.system_key IS NOT NULL AND NEW.system_key IS DISTINCT FROM OLD.system_key THEN
      RAISE EXCEPTION 'system_key cannot be changed'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.type = 'buy_x_get_y' AND NEW.system_key IS DISTINCT FROM 'offer_damaka' THEN
      RAISE EXCEPTION
        'Only the Offer Damaka system section may use buy_x_get_y. Create Buy X get Y under Promotions.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.system_key = 'offer_damaka' THEN
      NEW.title := 'Offer Damaka';
      NEW.type := 'buy_x_get_y';
      NEW.promotion_id := NULL;
    ELSIF NEW.system_key = 'daily_diary' THEN
      NEW.title := 'Daily Diary';
      NEW.type := 'product_shelf';
    ELSIF NEW.system_key = 'festive' THEN
      NEW.title := 'Festive';
      NEW.type := 'event_shelf';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shop_home_sections_system_guard ON shop_home_sections;
CREATE TRIGGER trg_shop_home_sections_system_guard
  BEFORE INSERT OR UPDATE ON shop_home_sections
  FOR EACH ROW
  EXECUTE PROCEDURE app.trg_shop_home_sections_system_guard();
