import { strict as assert } from "node:assert";
import { describe, it } from "mocha";
import {
  parseAutonomySettings,
  validateAutonomySettings,
  validateAutonomyAction
} from "../cloudflare-workers/netlify-test-agent-api/autonomy.js";

describe("Somerion bounded autonomy policy validation", function () {
  it("defaults autonomy to disabled and paused with no pre-authorized actions", function () {
    assert.deepEqual(parseAutonomySettings(null), {
      enabled: false,
      paused: true,
      allowed_actions: [],
      daily_action_limit: 10
    });
  });

  it("filters unknown actions from stored policy data", function () {
    const settings = parseAutonomySettings({
      enabled: 1,
      paused: 0,
      allowed_actions: JSON.stringify(["create_task", "send_payment", "create_content_draft"]),
      daily_action_limit: 100
    });
    assert.deepEqual(settings, {
      enabled: true,
      paused: false,
      allowed_actions: ["create_task", "create_content_draft"],
      daily_action_limit: 50
    });
  });

  it("accepts bounded workspace settings and rejects unsupported action permissions", function () {
    const valid = validateAutonomySettings({
      enabled: true,
      paused: false,
      allowed_actions: ["create_task", "update_task_status"],
      daily_action_limit: 12
    });
    assert.equal(valid.error, undefined);
    assert.equal(valid.value.daily_action_limit, 12);
    assert.match(validateAutonomySettings({
      enabled: true,
      paused: false,
      allowed_actions: ["issue_refund"],
      daily_action_limit: 12
    }).error, /unsupported/);
  });

  it("rejects invalid daily limits and duplicate permissions", function () {
    assert.match(validateAutonomySettings({
      enabled: true, paused: false, allowed_actions: [], daily_action_limit: 0
    }).error, /daily_action_limit/);
    assert.match(validateAutonomySettings({
      enabled: true, paused: false, allowed_actions: ["create_task", "create_task"], daily_action_limit: 3
    }).error, /unsupported or duplicate/);
  });

  it("validates internal task creation payloads and normalizes due dates", function () {
    const result = validateAutonomyAction("create_task", {
      title: "  Reconcile weekly orders  ",
      details: "Check unmatched transactions.",
      due_at: "2026-12-01T09:00:00Z"
    });
    assert.equal(result.error, undefined);
    assert.equal(result.value.title, "Reconcile weekly orders");
    assert.equal(result.value.due_at, "2026-12-01T09:00:00.000Z");
  });

  it("rejects unsupported external side effects such as publishing and payments", function () {
    assert.match(validateAutonomyAction("publish_social_post", { body: "Hello" }).error, /not supported/);
    assert.match(validateAutonomyAction("issue_refund", { amount: 10 }).error, /not supported/);
    assert.match(validateAutonomyAction("send_customer_message", { body: "Hello" }).error, /not supported/);
  });

  it("validates status updates and content drafts without executing external actions", function () {
    assert.equal(validateAutonomyAction("update_task_status", {
      task_id: "task-123",
      status: "done"
    }).error, undefined);
    assert.equal(validateAutonomyAction("create_content_draft", {
      channel: "instagram",
      title: "New collection",
      body: "A draft only."
    }).error, undefined);
    assert.match(validateAutonomyAction("create_content_draft", {
      channel: "unknown-platform",
      title: "New collection",
      body: "A draft only."
    }).error, /supported channel/);
  });

  it("rejects malformed task and content input", function () {
    assert.match(validateAutonomyAction("create_task", { title: " " }).error, /invalid/);
    assert.match(validateAutonomyAction("create_task", {
      title: "Task",
      due_at: "not-a-date"
    }).error, /valid date/);
    assert.match(validateAutonomyAction("create_content_draft", {
      channel: "email",
      title: " ",
      body: " "
    }).error, /supported channel/);
  });
});
