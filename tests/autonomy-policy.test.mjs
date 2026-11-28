import { strict as assert } from "node:assert";
import { describe, it } from "mocha";
import { parseAutonomySettings, validateAutonomySettings, validateAutonomyAction } from "../cloudflare-workers/netlify-test-agent-api/autonomy.js";

describe("Somerion bounded autonomy policy validation", function () {
  it("defaults autonomy to disabled and paused with no pre-authorized actions", function () {
    assert.deepEqual(parseAutonomySettings(null), { enabled: false, paused: true, allowed_actions: [], daily_action_limit: 10 });
  });
  it("filters unknown stored actions and clamps corrupt stored limits", function () {
    assert.deepEqual(parseAutonomySettings({ enabled: 1, paused: 0, allowed_actions: JSON.stringify(["create_task", "send_payment", "create_content_draft"]), daily_action_limit: 100 }), {
      enabled: true, paused: false, allowed_actions: ["create_task", "create_content_draft"], daily_action_limit: 50
    });
  });
  it("accepts bounded settings and rejects unsupported or duplicate permissions", function () {
    const valid = validateAutonomySettings({ enabled: true, paused: false, allowed_actions: ["create_task", "update_task_status"], daily_action_limit: 12 });
    assert.equal(valid.error, undefined);
    assert.equal(valid.value.daily_action_limit, 12);
    assert.match(validateAutonomySettings({ enabled: true, paused: false, allowed_actions: ["issue_refund"], daily_action_limit: 12 }).error, /unsupported/);
    assert.match(validateAutonomySettings({ enabled: true, paused: false, allowed_actions: ["create_task", "create_task"], daily_action_limit: 12 }).error, /duplicate/);
  });
  it("rejects malformed settings and unsafe daily limits", function () {
    assert.match(validateAutonomySettings(null).error, /object/);
    assert.match(validateAutonomySettings({ enabled: true, paused: false, allowed_actions: [], daily_action_limit: 0 }).error, /daily_action_limit/);
    assert.match(validateAutonomySettings({ enabled: true, paused: false, allowed_actions: [], daily_action_limit: 51 }).error, /daily_action_limit/);
  });
  it("normalizes valid internal task creation input", function () {
    const result = validateAutonomyAction("create_task", { title: "  Reconcile weekly orders  ", details: "Check unmatched transactions.", due_at: "2026-12-01T09:00:00Z" });
    assert.equal(result.error, undefined);
    assert.equal(result.value.title, "Reconcile weekly orders");
    assert.equal(result.value.due_at, "2026-12-01T09:00:00.000Z");
  });
  it("rejects unsupported external side effects", function () {
    for (const action of ["publish_social_post", "issue_refund", "send_customer_message", "change_ad_budget", "make_purchase"]) {
      assert.match(validateAutonomyAction(action, {}).error, /not supported/, action);
    }
  });
  it("validates internal task status updates", function () {
    assert.equal(validateAutonomyAction("update_task_status", { task_id: "task-123", status: "done" }).error, undefined);
    assert.match(validateAutonomyAction("update_task_status", { task_id: "", status: "delete" }).error, /task_id and status/);
  });
  it("validates content drafts without allowing external publishing", function () {
    assert.equal(validateAutonomyAction("create_content_draft", { channel: "instagram", title: "New collection", body: "A draft only." }).error, undefined);
    assert.match(validateAutonomyAction("create_content_draft", { channel: "unknown-platform", title: "New collection", body: "A draft only." }).error, /supported channel/);
  });
  it("rejects malformed task text and invalid due dates", function () {
    assert.match(validateAutonomyAction("create_task", { title: " " }).error, /invalid/);
    assert.match(validateAutonomyAction("create_task", { title: "Task", due_at: "not-a-date" }).error, /valid date/);
    assert.match(validateAutonomyAction("create_task", { title: "T".repeat(161) }).error, /invalid/);
  });
});
