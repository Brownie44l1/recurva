CREATE TABLE idempotency_cache (
    idempotency_key     TEXT PRIMARY KEY,
    response_status     INTEGER NOT NULL,
    response_body       JSONB NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_idempotency_cache_created ON idempotency_cache(created_at);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_idempotency_cache_created;
-- DROP TABLE IF EXISTS idempotency_cache;
