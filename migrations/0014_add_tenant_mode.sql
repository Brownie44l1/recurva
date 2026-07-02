ALTER TABLE tenants ADD COLUMN mode TEXT NOT NULL DEFAULT 'test' CHECK (mode IN ('test', 'live'));

-- ROLLBACK:
-- ALTER TABLE tenants DROP COLUMN mode;
