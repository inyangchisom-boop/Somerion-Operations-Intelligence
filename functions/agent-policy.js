"use strict";

/**
 * Fail-closed policy evaluator for Somerion's bounded-autonomy foundation.
 *
 * This module makes authorization decisions only. It does not execute actions,
 * call providers, or trust an AI model to grant permissions.
 */

const AUTONOMOUS_ROUTINE_TYPES = new Set([
  "internal_report",
  "lead_categorization",
  "inventory_alert",
  "content_draft"
]);

const ALWAYS_APPROVAL_TYPES = new Set([
  "customer_message",
  "public_publish",
  "campaign_change",
  "financial",
  "sensitive_admin",
  "destructive"
]);

function decision(status, reason, extra = {}) {
  return Object.freeze({ status, reason, ...extra });
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validCounter(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function evaluateAgentAction(input) {
  if (!isRecord(input) || !isRecord(input.control) ||
      !isRecord(input.policy) || !isRecord(input.action)) {
    return decision("denied", "invalid_evaluation_input");
  }

  const { actorUid, ownerUid, control, policy, action, usage } = input;

  if (typeof actorUid !== "string" || !actorUid ||
      typeof ownerUid !== "string" || !ownerUid || actorUid !== ownerUid) {
    return decision("denied", "owner_authorization_required");
  }

  if (control.ownerUid !== ownerUid) {
    return decision("denied", "control_owner_mismatch");
  }

  if (control.paused === true) {
    return decision("denied", "automation_paused");
  }

  if (control.enabled !== true || policy.enabled !== true) {
    return decision("denied", "automation_not_enabled");
  }

  if (typeof action.type !== "string" || !/^[a-z][a-z0-9_]{1,63}$/.test(action.type)) {
    return decision("denied", "invalid_action_type");
  }

  if (!Array.isArray(policy.allowedActionTypes) ||
      !policy.allowedActionTypes.every((item) => typeof item === "string")) {
    return decision("denied", "invalid_policy_allowlist");
  }

  if (!policy.allowedActionTypes.includes(action.type)) {
    return decision("denied", "action_not_allowlisted");
  }

  if (ALWAYS_APPROVAL_TYPES.has(action.type)) {
    return decision("approval_required", "high_impact_action");
  }

  if (!AUTONOMOUS_ROUTINE_TYPES.has(action.type)) {
    return decision("approval_required", "unclassified_action_requires_review");
  }

  if (action.reversible !== true) {
    return decision("approval_required", "action_not_confirmed_reversible");
  }

  if (action.externalSideEffect === true) {
    return decision("approval_required", "external_side_effect_requires_review");
  }

  if (typeof action.idempotencyKey !== "string" ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(action.idempotencyKey)) {
    return decision("denied", "valid_idempotency_key_required");
  }

  const estimatedCostMinor = action.estimatedCostMinor === undefined
    ? 0
    : action.estimatedCostMinor;
  if (!validCounter(estimatedCostMinor)) {
    return decision("denied", "invalid_estimated_cost");
  }
  if (estimatedCostMinor > 0) {
    return decision("approval_required", "any_spend_requires_explicit_approval");
  }

  const dailyActionLimit = policy.dailyActionLimit;
  const actionsUsedToday = usage && usage.actionsUsedToday;
  if (!validCounter(dailyActionLimit) || dailyActionLimit < 1 ||
      !validCounter(actionsUsedToday)) {
    return decision("denied", "valid_daily_action_limit_and_usage_required");
  }
  if (actionsUsedToday >= dailyActionLimit) {
    return decision("denied", "daily_action_limit_reached");
  }

  const dailySpendLimitMinor = policy.dailySpendLimitMinor === undefined
    ? 0
    : policy.dailySpendLimitMinor;
  const spendUsedTodayMinor = usage.spendUsedTodayMinor;
  if (!validCounter(dailySpendLimitMinor) ||
      !validCounter(spendUsedTodayMinor)) {
    return decision("denied", "invalid_spending_limit_or_usage");
  }
  if (estimatedCostMinor > dailySpendLimitMinor - spendUsedTodayMinor) {
    return decision("denied", "daily_spending_limit_reached");
  }

  return decision("allowed", "routine_action_within_policy", {
    actionType: action.type,
    remainingDailyActions: dailyActionLimit - actionsUsedToday - 1
  });
}

module.exports = {
  AUTONOMOUS_ROUTINE_TYPES: Object.freeze([...AUTONOMOUS_ROUTINE_TYPES]),
  ALWAYS_APPROVAL_TYPES: Object.freeze([...ALWAYS_APPROVAL_TYPES]),
  evaluateAgentAction
};
