CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       UUID REFERENCES tenants(id),
    resource_type   TEXT NOT NULL,
    resource_id     UUID NOT NULL,
    actor_type      TEXT NOT NULL,
    actor_id        TEXT,
    action          TEXT NOT NULL,
    diff            JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_tenant_time ON audit_logs(tenant_id, created_at DESC);

-- Add deferred foreign keys
ALTER TABLE subscriptions
    ADD CONSTRAINT fk_sub_payment_method
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id);

ALTER TABLE subscriptions
    ADD CONSTRAINT fk_sub_coupon
    FOREIGN KEY (coupon_id) REFERENCES coupons(id);

ALTER TABLE subscriptions
    ADD CONSTRAINT fk_sub_dunning
    FOREIGN KEY (dunning_policy_id) REFERENCES dunning_policies(id);

-- ROLLBACK:
-- ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS fk_sub_dunning;
-- ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS fk_sub_coupon;
-- ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS fk_sub_payment_method;
-- DROP INDEX IF EXISTS idx_audit_tenant_time;
-- DROP INDEX IF EXISTS idx_audit_resource;
-- DROP TABLE IF EXISTS audit_logs;
