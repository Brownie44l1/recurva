CREATE TABLE billing_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  lock_acquired   BOOLEAN NOT NULL DEFAULT FALSE,
  subscriptions_processed INT NOT NULL DEFAULT 0,
  subscriptions_failed    INT NOT NULL DEFAULT 0,
  invoices_created        INT NOT NULL DEFAULT 0,
  charges_succeeded       INT NOT NULL DEFAULT 0,
  charges_failed          INT NOT NULL DEFAULT 0,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ROLLBACK:
-- DROP TABLE IF EXISTS billing_runs;
