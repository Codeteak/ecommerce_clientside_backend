CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line1 TEXT,
  line2 TEXT,
  landmark TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  raw TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'addresses_lat_lng_bounds_chk') THEN
    ALTER TABLE addresses
      ADD CONSTRAINT addresses_lat_lng_bounds_chk CHECK (
        (lat IS NULL AND lng IS NULL)
        OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
      );
  END IF;
END $$;

-- `users` before `shops` so `shops.owner_user_id` can reference `users(id)` inline.
