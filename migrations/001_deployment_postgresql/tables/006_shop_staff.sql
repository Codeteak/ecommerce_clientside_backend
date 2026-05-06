CREATE TABLE IF NOT EXISTS shop_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'picker')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_name TEXT,
  device_push_token TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'deleted')),
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (shop_id, user_id)
);
