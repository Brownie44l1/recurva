CREATE TABLE IF NOT EXISTS rate_limits (
    key         TEXT NOT NULL,
    window_start BIGINT NOT NULL,
    count       INT NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (key, window_start)
);

CREATE INDEX idx_rate_limits_cleanup ON rate_limits(window_start);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_rate_limits_cleanup;
-- DROP TABLE IF EXISTS rate_limits;
