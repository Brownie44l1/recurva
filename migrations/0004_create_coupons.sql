CREATE TABLE coupons (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code                TEXT NOT NULL,
    discount_type       TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
    discount_value      BIGINT NOT NULL CHECK (discount_value > 0),
    currency            TEXT CHECK (currency IN ('NGN', 'USD', 'GBP', 'EUR')),
    duration            TEXT NOT NULL CHECK (duration IN ('once', 'repeating', 'forever')),
    duration_months     INT CHECK (duration_months > 0),
    max_redemptions     INT CHECK (max_redemptions > 0),
    redemption_count    INT NOT NULL DEFAULT 0,
    expires_at          TIMESTAMPTZ,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
);

CREATE INDEX idx_coupons_code_trgm ON coupons USING GIN (code gin_trgm_ops);
CREATE INDEX idx_coupons_tenant ON coupons(tenant_id) WHERE is_active = TRUE;

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_coupons_tenant;
-- DROP INDEX IF EXISTS idx_coupons_code_trgm;
-- DROP TABLE IF EXISTS coupons;
