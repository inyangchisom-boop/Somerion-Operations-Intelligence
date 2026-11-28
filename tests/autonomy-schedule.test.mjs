import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const worker = readFileSync("cloudflare-workers/netlify-test-agent-api/worker.js", "utf8");
const migration = readFileSync("cloudflare-workers/migrations/netlify-test-agent-autonomy.sql", "utf8");

test("isolated Agent API has a scheduled task-monitor handler", () => {
  assert.match(worker, /async scheduled\(controller,env\)/);
  assert.match(worker, /FROM agent_tasks t LEFT JOIN agent_preferences p/);
  assert.match(worker, /t\.due_at<=\?/);
});

test("scheduled reminders respect disabled reminder preferences", () => {
  assert.match(worker, /if\(task\.reminders_enabled===0\)continue/);
});

test("scheduled reminders are idempotent and workspace scoped", () => {
  assert.match(worker, /INSERT OR IGNORE INTO agent_notifications/);
  assert.match(worker, /WHERE uid=\?/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS agent_notifications/);
  assert.match(migration, /PRIMARY KEY \(id\)/);
});

test("notification API reads only the authenticated user's saved notifications", () => {
  assert.match(worker, /FROM agent_notifications WHERE uid=\?/);
  assert.match(worker, /SELECT id,message,created_at,read_at/);
});
