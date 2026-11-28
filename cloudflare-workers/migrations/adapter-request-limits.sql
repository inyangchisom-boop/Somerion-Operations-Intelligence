-- Apply this migration separately to each adapter D1 database:
-- Core: 0ceaa51a-538c-4895-adee-103c1c7d69ea
-- Shopify: e58cf6a7-4b1e-4fd8-bfc2-fea946772b77
-- WooCommerce: e2e39570-4c37-4cdb-bcdc-606ce52f497a
-- Social: 27f42ef5-7c8a-4693-bc7d-f69aa1d922f3
CREATE TABLE IF NOT EXISTS request_limits (
  user_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  reset_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, bucket)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_request_limits_reset_at
  ON request_limits(reset_at);
