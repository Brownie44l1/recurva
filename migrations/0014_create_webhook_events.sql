CREATE TABLE IF NOT EXISTS webhook_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomba_event_id    TEXT NOT NULL UNIQUE,
  event_type        TEXT NOT NULL,
  payload           JSONB NOT NULL DEFAULT '{}',
  tenant_id         TEXT,
  processed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dead_letter_webhooks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomba_event_id    TEXT,
  event_type        TEXT NOT NULL,
  payload           JSONB NOT NULL DEFAULT '{}',
  raw_body          TEXT,
  reason            TEXT,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_event_id ON webhook_events(nomba_event_id);
CREATE INDEX idx_webhook_events_type ON webhook_events(event_type);

-- ROLLBACK:
-- DROP TABLE IF EXISTS dead_letter_webhooks;
-- DROP TABLE IF EXISTS webhook_events;
