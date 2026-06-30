CREATE TABLE pending_checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  subscription_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  order_reference VARCHAR(255) NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pending_checkouts_order_reference ON pending_checkouts(order_reference);
CREATE INDEX idx_pending_checkouts_tenant ON pending_checkouts(tenant_id);

-- ROLLBACK:
-- DROP TABLE IF EXISTS pending_checkouts;
