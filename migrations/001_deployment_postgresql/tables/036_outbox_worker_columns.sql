-- Optional outbox worker columns (src/application/services/outboxProcessor.js).
-- Safe on installs that only insert rows via OrderRepo (published_at model still works).

ALTER TABLE outbox_messages ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE outbox_messages ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;
ALTER TABLE outbox_messages ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'outbox_messages_status_chk'
  ) THEN
    ALTER TABLE outbox_messages
      ADD CONSTRAINT outbox_messages_status_chk
      CHECK (status IN ('pending', 'processing', 'done', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_outbox_messages_status_created
  ON outbox_messages (status, created_at)
  WHERE status IN ('pending', 'processing');
