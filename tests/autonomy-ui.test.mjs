import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync("index.html", "utf8");
const app = readFileSync("assets/app.js", "utf8");
const css = readFileSync("assets/styles.css", "utf8");

test("autonomy controls are present in the isolated task monitor", () => {
  for (const id of [
    "agentAutonomyForm", "agentAutonomyEnabled", "agentAutonomyPaused",
    "agentAllowCreateTask", "agentAllowUpdateTask", "agentAllowDraft",
    "agentAutonomyLimit", "agentEmergencyPause", "agentAutonomyTaskForm",
    "agentAutonomyDraftForm", "agentProposalList", "agentDraftList", "agentAuditList"
  ]) assert.match(html, new RegExp('id="' + id + '"'), id);
});

test("autonomy browser calls target only the isolated test Agent API", () => {
  assert.ok(app.includes("https://somerion-netlify-test-agent-api.somerion-oi.workers.dev"));
  assert.ok(app.includes('autonomyCall("/v1/autonomy/settings"'));
  assert.ok(app.includes('autonomyCall("/v1/autonomy/actions"'));
  assert.ok(!app.includes("https://somerion-agent-api-v1.somerion-oi.workers.dev"));
});

test("autonomy action requests use idempotency keys and explicit approval routes", () => {
  assert.ok(app.includes('"Idempotency-Key":crypto.randomUUID()'));
  assert.ok(app.includes('"/"+decision'));
  assert.ok(app.includes("data-autonomy-approve"));
  assert.ok(app.includes("data-autonomy-reject"));
});

test("test dashboard discloses that external actions are not enabled", () => {
  assert.match(html, /cannot publish posts, send messages, change ad spend, issue refunds, purchase items or make payments/i);
  assert.match(app, /AI model connection is not enabled in this testing environment/);
});

test("autonomy controls have mobile responsive styling", () => {
  assert.match(css, /\.agent-autonomy-card/);
  assert.match(css, /@media\(max-width:680px\)/);
});
