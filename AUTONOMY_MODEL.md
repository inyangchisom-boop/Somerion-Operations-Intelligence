# Somerion Autonomous Operating Model

**Status:** Product requirements and safety policy. This document does not mean that the capabilities described here are already implemented or enabled.

## Product direction

Somerion Operations Intelligence is intended to become an autonomous, permission-bounded business operations platform spanning marketing, sales, and ecommerce operations. It should monitor authorized business data, identify opportunities and problems, plan actions, execute permitted routine work, and explain its activity.

Autonomy must never mean unrestricted access. Each action must be authorized by the workspace owner, constrained by policy, and recorded.

## Authority model

Use **bounded autonomy** as the default operating model:

- The agent may execute routine, reversible, pre-authorized tasks without asking for approval each time.
- The agent must request approval before high-impact, costly, externally binding, sensitive, or difficult-to-reverse actions.
- The agent must refuse actions outside the user's permissions, configured limits, provider scopes, or the platform's safety policy.
- If authorization, data freshness, task outcome, or policy evaluation is uncertain, stop and ask rather than guessing.

### Action classes

| Class | Examples | Default behavior |
|---|---|---|
| Read and analyze | Read connected order metrics, summarize campaign results, detect inventory changes | Allowed only for connected sources and granted scopes |
| Routine low-risk execution | Draft internal reports, categorize leads, prepare content drafts, schedule pre-approved posts within an approved calendar | Autonomous when explicitly enabled for that workspace |
| Customer-facing communication | Send approved templates, routine follow-ups, respond using owner-approved knowledge | Autonomous only with channel-specific opt-in, rate limits, quiet hours, and opt-out handling |
| Public publishing and campaign changes | Publish posts, pause or adjust campaigns, change budgets or targeting | Approval required unless a narrowly scoped policy explicitly pre-authorizes the exact action and limit |
| Financial or binding actions | Payments, refunds, purchases, subscriptions, ad spend increases, accepting contracts | Explicit human approval required; no autonomous financial commitment |
| Sensitive administration | Change roles, permissions, authentication, payout details, credentials, data export/deletion, security settings | Explicit owner approval and step-up authentication; never delegated to a general-purpose agent |
| Destructive or irreversible actions | Delete stores, bulk-delete records, revoke accounts, send bulk messages | Explicit confirmation, impact preview, and recoverability check; block if safeguards are unavailable |

## Required controls

1. **Workspace authorization:** Enforce permissions on the server for every action. Hiding a button in the browser is not authorization.
2. **Least privilege:** Give each agent only the provider scopes, workspace roles, and tools needed for its assigned tasks.
3. **Policy engine:** Evaluate actor, workspace, action type, target, amount, frequency, time window, and approval state before execution.
4. **Spending and volume limits:** Support per-action, daily, monthly, and channel-specific caps. Default financial spending limit is zero until an owner configures and approves a policy; financial commitments still require explicit approval.
5. **Approval workflow:** Show the exact proposed action, target, content or payload, estimated cost, and consequences. Approval must be bound to that exact action and expire if the payload changes.
6. **Audit trail:** Record who or what initiated an action, policy decision, approval, timestamp, target, result, and provider reference. Protect logs from ordinary-user modification.
7. **Emergency stop:** Workspace owners can pause all agents and revoke pending execution. The server must check pause state immediately before each side effect.
8. **Rate and abuse controls:** Enforce limits server-side per user, workspace, agent, IP, provider, and action category where appropriate.
9. **Data protection:** Encrypt provider credentials, never expose secrets to the browser or model prompt, redact sensitive data from logs, and isolate tenant data.
10. **Failure handling:** Use idempotency keys, bounded retries, timeouts, and reconciliation. Never silently retry a financial or externally visible action when the outcome is ambiguous.
11. **Transparency:** Explain why the agent acted, what data it relied on, what policy authorized it, and whether the action succeeded.
12. **Human override:** Owners can edit, cancel, pause, or revoke automation policies at any time.

## Initial capability areas

### Marketing intelligence and execution
- Analyze channel and campaign performance.
- Prepare content calendars, copy, and creative briefs.
- Identify underperforming campaigns and propose changes.
- Schedule or publish only through connected providers and only within approved content, timing, and channel permissions.
- Respect brand rules, platform policies, consent, opt-outs, and messaging limits.

### Sales intelligence and execution
- Organize leads and sales opportunities.
- Summarize pipeline health, conversion, and revenue trends.
- Prepare quotes and follow-up drafts.
- Send follow-ups only where the customer has an appropriate communication basis and the workspace has enabled that channel.
- Do not invent product availability, prices, discounts, promises, or customer facts.

### Ecommerce operations
- Monitor orders, inventory, fulfillment, and exceptions.
- Detect anomalies and prioritize work.
- Recommend corrective actions.
- Execute only low-risk, reversible tasks that have explicit policies; require approval for refunds, purchases, financial changes, and destructive actions.

## Technical execution contract

Every autonomous task must follow this sequence:

1. Receive a scheduled trigger or authorized event.
2. Authenticate the service identity and resolve the workspace.
3. Load current permissions, automation policies, pause state, limits, and relevant provider scopes.
4. Fetch only the minimum necessary data from authorized sources.
5. Generate a proposed action with a structured action type and validated parameters.
6. Run server-side policy evaluation; do not let the model decide its own permissions.
7. If approval is required, persist a pending proposal and notify an authorized human. Do not execute.
8. If permitted autonomously, acquire an idempotency key and re-check limits and pause state immediately before the side effect.
9. Execute through a server-side provider adapter; never expose provider credentials to the browser or model.
10. Verify the provider result, persist the outcome, and append an immutable audit event.
11. On ambiguity or failure, stop, reconcile, and surface the issue rather than claiming success.

The model may propose actions. Trusted server code must authorize and execute them.

## Release and rollout gates

- All connected-platform development remains in sandbox/test mode with synthetic test data until the relevant security checks pass and the owner explicitly approves production.
- Do not connect real client accounts or process real client data during the test phase.
- Start with read-only monitoring and recommendations, then enable low-risk actions behind per-workspace opt-in.
- Before customer-facing automation, test permissions, tenant isolation, opt-outs, rate limits, replay protection, idempotency, audit logs, pause behavior, and failure recovery.
- Before production, complete independent security review and provider-specific OAuth, webhook, and data-retention checks.
- Do not describe an action as completed unless the provider response and persisted audit record confirm it.

## Implementation phases

1. **Foundation:** Workspace roles, server-side authorization, agent registry, policy schema, audit events, pause switch, and test harness.
2. **Observe:** Read-only integrations, scheduled monitoring, anomaly detection, reports, and recommendations.
3. **Assist:** Action proposals, previews, approvals, and notifications; no external side effects without approval.
4. **Bounded execution:** Enable selected low-risk tasks per workspace with limits, idempotency, audit, and emergency stop.
5. **Expanded autonomy:** Add additional providers and action classes only after security and operational validation.

## Current implementation status

**Isolated test environment — implemented in source and deployed to the test Worker:**
- Workspace autonomy settings, disabled and paused by default.
- Server-side allowlist for internal task creation, task-status updates, and content-draft creation.
- Approval/rejection flow, 24-hour proposal expiry, idempotency keys, atomic daily action limits, and per-user D1 scoping.
- Audit events for settings changes, proposals, approvals, rejections, blocks, and execution outcomes.
- Emergency pause that prevents pending approvals from executing.
- Scheduled task-due monitoring every 15 minutes, writing idempotent in-app notifications and respecting reminder preferences.
- Test dashboard controls are merged to the `netlify-testing` branch. Its GitHub verification workflow passed; the public Netlify deployment and browser behavior have not been independently verified.

**Not implemented or enabled:**
- No connected language model is making independent business plans or generating actions.
- No social publishing, customer messaging, campaign management, ad-budget changes, payments, refunds, purchases, or external business-side effects.
- No production Agent API, production Firebase project, or live customer account has been changed for this autonomy work.
- The deployed test Worker and D1 schema are isolated test infrastructure. Their deployment metadata and Cron Trigger configuration were confirmed through Cloudflare; a live authenticated end-to-end browser test remains outstanding.

This status is deliberately specific: the internal policy/execution foundation and scheduled reminders exist in the isolated test environment, but Somerion is not yet a fully autonomous marketing, sales, and operations platform. Each additional capability must be implemented and tested before being presented as available.
