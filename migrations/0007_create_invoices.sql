CREATE TABLE invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    customer_id         UUID NOT NULL REFERENCES customers(id),
    subscription_id     UUID NOT NULL REFERENCES subscriptions(id),
    currency            TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                            'draft', 'open', 'paid', 'void', 'uncollectible'
                        )),
    subtotal            BIGINT NOT NULL DEFAULT 0,
    discount_amount     BIGINT NOT NULL DEFAULT 0,
    total               BIGINT NOT NULL DEFAULT 0,
    amount_due          BIGINT NOT NULL DEFAULT 0,
    amount_paid         BIGINT NOT NULL DEFAULT 0,
    period_start        TIMESTAMPTZ NOT NULL,
    period_end          TIMESTAMPTZ NOT NULL,
    due_date            TIMESTAMPTZ NOT NULL,
    paid_at             TIMESTAMPTZ,
    voided_at           TIMESTAMPTZ,
    nomba_charge_id     TEXT,
    idempotency_key     TEXT NOT NULL UNIQUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_due ON invoices(due_date) WHERE status = 'open';
CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);

CREATE TABLE invoice_line_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('subscription', 'metered', 'proration', 'credit')),
    description     TEXT NOT NULL,
    quantity        BIGINT NOT NULL DEFAULT 1,
    unit_amount     BIGINT NOT NULL,
    amount          BIGINT NOT NULL,
    period_start    TIMESTAMPTZ,
    period_end      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_line_items_invoice ON invoice_line_items(invoice_id);

CREATE TABLE charges (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    customer_id         UUID NOT NULL REFERENCES customers(id),
    invoice_id          UUID NOT NULL REFERENCES invoices(id),
    payment_method_id   UUID, -- REFERENCES payment_methods(id)
    currency            TEXT NOT NULL,
    amount              BIGINT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                            'pending', 'succeeded', 'failed', 'refunded'
                        )),
    nomba_charge_id     TEXT,
    nomba_reference     TEXT,
    failure_code        TEXT,
    failure_message     TEXT,
    amount_refunded     BIGINT NOT NULL DEFAULT 0,
    refunded_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_charges_invoice ON charges(invoice_id);
CREATE INDEX idx_charges_nomba ON charges(nomba_charge_id);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_charges_nomba;
-- DROP INDEX IF EXISTS idx_charges_invoice;
-- DROP TABLE IF EXISTS charges;
-- DROP INDEX IF EXISTS idx_line_items_invoice;
-- DROP TABLE IF EXISTS invoice_line_items;
-- DROP INDEX IF EXISTS idx_invoices_tenant;
-- DROP INDEX IF EXISTS idx_invoices_due;
-- DROP INDEX IF EXISTS idx_invoices_customer;
-- DROP INDEX IF EXISTS idx_invoices_subscription;
-- DROP TABLE IF EXISTS invoices;
