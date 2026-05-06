CREATE TABLE IF NOT EXISTS global_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'shared' CHECK (scope IN ('shared', 'private')),
  owner_shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES global_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
