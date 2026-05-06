CREATE TABLE IF NOT EXISTS global_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'shared' CHECK (scope IN ('shared', 'private')),
  owner_shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
