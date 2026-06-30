CREATE TABLE webhook_endpoints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    event_types     JSONB NOT NULL DEFAULT '[]',
    signing_secret  TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_tenant ON webhook_endpoints(tenant_id) WHERE is_active = TRUE;

CREATE TABLE webhook_deliveries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    event_type          TEXT NOT NULL,
    payload             JSONB NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending',
    attempt_count       INT NOT NULL DEFAULT 0,
    next_retry_at       TIMESTAMPTZ,
    last_response_code  INT,
    last_response_body  TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wh_deliveries_pending ON webhook_deliveries(next_retry_at)
    WHERE status IN ('pending', 'failed');
CREATE INDEX idx_wh_deliveries_endpoint ON webhook_deliveries(webhook_endpoint_id);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_wh_deliveries_endpoint;
-- DROP INDEX IF EXISTS idx_wh_deliveries_pending;
-- DROP TABLE IF EXISTS webhook_deliveries;
-- DROP INDEX IF EXISTS idx_webhooks_tenant;
-- DROP TABLE IF EXISTS webhook_endpoints;
