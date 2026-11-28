-- Required before deploying the hardened production Agent API.
-- One row per authenticated user and rate-limit bucket.
CREATE TABLE IF NOT EXISTS request_limits (
  user_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  reset_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, bucket)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_request_limits_reset_at
  ON request_limits(reset_at);
