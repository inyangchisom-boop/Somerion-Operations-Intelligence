"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateAgentAction } = require("../agent-policy");

function fixture(overrides = {}) {
  return {
    actorUid: "owner-123",
    ownerUid: "owner-123",
    control: { ownerUid: "owner-123", enabled: true, paused: false },
    policy: {
      enabled: true,
      allowedActionTypes: ["internal_report", "lead_categorization"],
      dailyActionLimit: 20,
      dailySpendLimitMinor: 0
    },
    action: {
      type: "internal_report",
      reversible: true,
      externalSideEffect: false,
      estimatedCostMinor: 0,
      idempotencyKey: "unit-test-key-00000000"
    },
    usage: { actionsUsedToday: 0, spendUsedTodayMinor: 0 },
    ...overrides
  };
}

test("allows a reversible, zero-cost, allowlisted routine action", () => {
  const result = evaluateAgentAction(fixture());
  assert.equal(result.status, "allowed");
  assert.equal(result.remainingDailyActions, 19);
});

test("fails closed for malformed input and mismatched owner", () => {
  assert.equal(evaluateAgentAction(null).status, "denied");
  assert.equal(evaluateAgentAction(fixture({ actorUid: "other-user" })).reason,
    "owner_authorization_required");
});

test("blocks paused or disabled automation", () => {
  assert.equal(evaluateAgentAction(fixture({
    control: { ownerUid: "owner-123", enabled: true, paused: true }
  })).reason, "automation_paused");
  assert.equal(evaluateAgentAction(fixture({
    policy: { ...fixture().policy, enabled: false }
  })).reason, "automation_not_enabled");
});

test("denies actions not explicitly allowlisted", () => {
  assert.equal(evaluateAgentAction(fixture({
    action: { ...fixture().action, type: "unknown_action" }
  })).reason, "action_not_allowlisted");
});

test("requires approval for customer messages, publishing, campaign changes and finance", () => {
  for (const type of ["customer_message", "public_publish", "campaign_change", "financial"]) {
    const result = evaluateAgentAction(fixture({
      policy: { ...fixture().policy, allowedActionTypes: [type] },
      action: { ...fixture().action, type }
    }));
    assert.equal(result.status, "approval_required", type);
  }
});

test("requires approval for external side effects and non-reversible actions", () => {
  assert.equal(evaluateAgentAction(fixture({
    action: { ...fixture().action, externalSideEffect: true }
  })).status, "approval_required");
  assert.equal(evaluateAgentAction(fixture({
    action: { ...fixture().action, reversible: false }
  })).status, "approval_required");
});

test("requires a valid idempotency key", () => {
  assert.equal(evaluateAgentAction(fixture({
    action: { ...fixture().action, idempotencyKey: "short" }
  })).reason, "valid_idempotency_key_required");
});

test("requires approval for any non-zero spend", () => {
  assert.equal(evaluateAgentAction(fixture({
    action: { ...fixture().action, estimatedCostMinor: 1 }
  })).reason, "any_spend_requires_explicit_approval");
});

test("enforces daily action limits", () => {
  assert.equal(evaluateAgentAction(fixture({
    usage: { actionsUsedToday: 20, spendUsedTodayMinor: 0 }
  })).reason, "daily_action_limit_reached");
});

test("rejects invalid limits and negative usage", () => {
  assert.equal(evaluateAgentAction(fixture({
    policy: { ...fixture().policy, dailyActionLimit: -1 }
  })).status, "denied");
  assert.equal(evaluateAgentAction(fixture({
    usage: { actionsUsedToday: -1, spendUsedTodayMinor: 0 }
  })).status, "denied");
});
