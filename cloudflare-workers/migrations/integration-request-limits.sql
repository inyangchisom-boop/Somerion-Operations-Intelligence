-- Target D1 database: somerion-integration-api (008cdd28-8f59-4af4-9438-f13e498bf902)
-- Required before deploying the hardened production Integration API.
CREATE TABLE IF NOT EXISTS request_limits (
  user_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  reset_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, bucket)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_integration_request_limits_reset_at
  ON request_limits(reset_at);
