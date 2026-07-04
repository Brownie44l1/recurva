ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount BIGINT NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 4);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_exemption_reason TEXT;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS annual_turnover BIGINT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_exempt BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE invoice_line_items DROP CONSTRAINT IF EXISTS invoice_line_items_type_check;
ALTER TABLE invoice_line_items ADD CONSTRAINT invoice_line_items_type_check
  CHECK (type IN ('subscription', 'metered', 'proration', 'credit', 'tax'));
