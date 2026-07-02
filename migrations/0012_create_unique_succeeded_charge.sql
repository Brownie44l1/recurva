-- Prevent duplicate successful charges on the same invoice
CREATE UNIQUE INDEX idx_charges_unique_succeeded ON charges(invoice_id) WHERE status = 'succeeded';

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_charges_unique_succeeded;
