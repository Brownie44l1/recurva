ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN (
    'incomplete', 'trialing', 'active', 'past_due', 'paused',
    'cancelled', 'ended', 'unpaid'
  ));

-- ROLLBACK:
-- ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
-- ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
--   CHECK (status IN (
--     'trialing', 'active', 'past_due', 'paused',
--     'cancelled', 'ended', 'unpaid'
--   ));
