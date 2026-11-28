-- Isolated test Agent API only.
-- Apply to D1 database somerion-netlify-test-db before deploying the test Worker.
-- This migration creates workspace-scoped policy, proposal, audit, and draft records.
CREATE TABLE IF NOT EXISTS agent_autonomy_settings (
  uid TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  paused INTEGER NOT NULL DEFAULT 1 CHECK (paused IN (0,1)),
  allowed_actions TEXT NOT NULL DEFAULT '[]',
  daily_action_limit INTEGER NOT NULL DEFAULT 10 CHECK (daily_action_limit BETWEEN 1 AND 50),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_action_proposals (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  action_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('executing','pending_approval','executed','rejected','expired','blocked_limit')),
  approval_required INTEGER NOT NULL DEFAULT 0 CHECK (approval_required IN (0,1)),
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  executed_at TEXT,
  UNIQUE(uid, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_action_proposals_user_created
  ON agent_action_proposals(uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_action_proposals_user_status
  ON agent_action_proposals(uid, status, created_at);

CREATE TABLE IF NOT EXISTS agent_action_audit (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  proposal_id TEXT,
  action_type TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_action_audit_user_created
  ON agent_action_audit(uid, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_content_drafts (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_content_drafts_user_created
  ON agent_content_drafts(uid, created_at DESC);
