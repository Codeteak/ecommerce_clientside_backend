CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256 CHAR(64) NOT NULL UNIQUE,
  storage_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
