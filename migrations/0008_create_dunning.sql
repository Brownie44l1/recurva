CREATE TABLE dunning_policies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    retry_schedule  JSONB NOT NULL,
    final_action    TEXT NOT NULL DEFAULT 'cancel' CHECK (final_action IN ('cancel', 'mark_unpaid')),
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_dunning_default ON dunning_policies(tenant_id) WHERE is_default = TRUE;

CREATE TABLE dunning_attempts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id     UUID NOT NULL REFERENCES subscriptions(id),
    invoice_id          UUID NOT NULL REFERENCES invoices(id),
    charge_id           UUID REFERENCES charges(id),
    attempt_number      INT NOT NULL,
    scheduled_at        TIMESTAMPTZ NOT NULL,
    executed_at         TIMESTAMPTZ,
    status              TEXT NOT NULL DEFAULT 'scheduled',
    used_backup_card    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dunning_sub ON dunning_attempts(subscription_id);
CREATE INDEX idx_dunning_scheduled ON dunning_attempts(scheduled_at) WHERE status = 'scheduled';

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_dunning_scheduled;
-- DROP INDEX IF EXISTS idx_dunning_sub;
-- DROP TABLE IF EXISTS dunning_attempts;
-- DROP INDEX IF EXISTS idx_dunning_default;
-- DROP TABLE IF EXISTS dunning_policies;
