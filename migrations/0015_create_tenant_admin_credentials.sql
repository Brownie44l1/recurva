CREATE TABLE tenant_admin_credentials (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_admin_creds_email ON tenant_admin_credentials(email);
CREATE INDEX idx_admin_creds_tenant ON tenant_admin_credentials(tenant_id);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_admin_creds_tenant;
-- DROP INDEX IF EXISTS idx_admin_creds_email;
-- DROP TABLE IF EXISTS tenant_admin_credentials;
