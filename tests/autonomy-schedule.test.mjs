import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "mocha";

const worker = readFileSync("cloudflare-workers/netlify-test-agent-api/worker.js", "utf8");
const migration = readFileSync("cloudflare-workers/migrations/netlify-test-agent-autonomy.sql", "utf8");

describe("isolated Agent API scheduled task monitor", function () {
  it("has a scheduled task-monitor handler", function () {
  assert.match(worker, /async scheduled\(controller,env\)/);
  assert.match(worker, /FROM agent_tasks t LEFT JOIN agent_preferences p/);
  assert.match(worker, /t\.due_at<=\?/);
});

  it("respects disabled reminder preferences", function () {
  assert.match(worker, /if\(task\.reminders_enabled===0\)continue/);
});

  it("uses idempotent inserts and workspace-scoped storage", function () {
  assert.match(worker, /ON CONFLICT\(id\) DO UPDATE SET message=excluded\.message/);
  assert.match(worker, /WHERE uid=\?/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS agent_notifications/);
  assert.match(migration, /id TEXT PRIMARY KEY/);
});

  it("reads only the authenticated user's saved notifications", function () {
  assert.match(worker, /FROM agent_notifications n JOIN agent_tasks t/);
  assert.match(worker, /SELECT id,message,created_at,read_at/);
});
