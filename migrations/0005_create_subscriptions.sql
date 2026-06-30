CREATE TABLE subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id),
    customer_id             UUID NOT NULL REFERENCES customers(id),
    plan_id                 UUID NOT NULL REFERENCES plans(id),
    currency                TEXT NOT NULL CHECK (currency IN ('NGN', 'USD', 'GBP', 'EUR')),
    status                  TEXT NOT NULL CHECK (status IN (
                                'trialing', 'active', 'past_due', 'paused',
                                'cancelled', 'ended', 'unpaid'
                            )),
    payment_method_id       UUID, -- REFERENCES payment_methods(id) added later
    coupon_id               UUID, -- REFERENCES coupons(id) added later
    trial_start             TIMESTAMPTZ,
    trial_end               TIMESTAMPTZ,
    current_period_start    TIMESTAMPTZ NOT NULL,
    current_period_end      TIMESTAMPTZ NOT NULL,
    cancelled_at            TIMESTAMPTZ,
    cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE,
    credit_balance          BIGINT NOT NULL DEFAULT 0,
    dunning_policy_id       UUID,
    metadata                JSONB NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subs_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_subs_customer ON subscriptions(customer_id);
CREATE INDEX idx_subs_status ON subscriptions(status) WHERE status IN ('active', 'past_due', 'trialing');
CREATE INDEX idx_subs_period_end ON subscriptions(current_period_end)
    WHERE status IN ('active', 'trialing');

CREATE TABLE coupon_redemptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id           UUID NOT NULL REFERENCES coupons(id),
    subscription_id     UUID NOT NULL REFERENCES subscriptions(id),
    months_applied      INT NOT NULL DEFAULT 0,
    redeemed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (coupon_id, subscription_id)
);

CREATE TABLE subscription_metered_usage (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id     UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    idempotency_key     TEXT NOT NULL,
    quantity            BIGINT NOT NULL CHECK (quantity > 0),
    action              TEXT NOT NULL DEFAULT 'sum' CHECK (action = 'sum'),
    period_start        TIMESTAMPTZ NOT NULL,
    period_end          TIMESTAMPTZ NOT NULL,
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (subscription_id, idempotency_key)
);

CREATE INDEX idx_usage_sub_period ON subscription_metered_usage(subscription_id, period_start, period_end);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_usage_sub_period;
-- DROP TABLE IF EXISTS subscription_metered_usage;
-- DROP TABLE IF EXISTS coupon_redemptions;
-- DROP INDEX IF EXISTS idx_subs_period_end;
-- DROP INDEX IF EXISTS idx_subs_status;
-- DROP INDEX IF EXISTS idx_subs_customer;
-- DROP INDEX IF EXISTS idx_subs_tenant;
-- DROP TABLE IF EXISTS subscriptions;
