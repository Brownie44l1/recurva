CREATE UNIQUE INDEX idx_dunning_attempts_unique
  ON dunning_attempts (subscription_id, invoice_id, attempt_number);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_dunning_attempts_unique;
