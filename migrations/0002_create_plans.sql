CREATE TABLE plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    billing_type    TEXT NOT NULL CHECK (billing_type IN ('fixed', 'metered', 'mixed')),
    interval        TEXT NOT NULL CHECK (interval IN ('day', 'week', 'month', 'year')),
    interval_count  INT NOT NULL DEFAULT 1 CHECK (interval_count > 0),
    trial_days      INT CHECK (trial_days >= 0),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plans_tenant ON plans(tenant_id) WHERE is_active = TRUE;

CREATE TABLE plan_currencies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id     UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    currency    TEXT NOT NULL CHECK (currency IN ('NGN', 'USD', 'GBP', 'EUR')),
    amount      BIGINT NOT NULL CHECK (amount >= 0),
    unit_amount BIGINT CHECK (unit_amount >= 0),
    UNIQUE (plan_id, currency)
);

CREATE INDEX idx_plan_currencies_plan ON plan_currencies(plan_id);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_plan_currencies_plan;
-- DROP TABLE IF EXISTS plan_currencies;
-- DROP INDEX IF EXISTS idx_plans_tenant;
-- DROP TABLE IF EXISTS plans;
