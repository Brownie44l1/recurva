CREATE TABLE payment_methods (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nomba_token         TEXT NOT NULL,
    card_last4          TEXT NOT NULL CHECK (card_last4 ~ '^\d{4}$'),
    card_brand          TEXT NOT NULL,
    card_exp_month      INT NOT NULL CHECK (card_exp_month BETWEEN 1 AND 12),
    card_exp_year       INT NOT NULL CHECK (card_exp_year >= 2020),
    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
    is_backup           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_pm_primary ON payment_methods(customer_id)
    WHERE is_primary = TRUE;
CREATE UNIQUE INDEX idx_pm_backup ON payment_methods(customer_id)
    WHERE is_backup = TRUE;
CREATE INDEX idx_pm_customer ON payment_methods(customer_id);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_pm_customer;
-- DROP INDEX IF EXISTS idx_pm_backup;
-- DROP INDEX IF EXISTS idx_pm_primary;
-- DROP TABLE IF EXISTS payment_methods;
