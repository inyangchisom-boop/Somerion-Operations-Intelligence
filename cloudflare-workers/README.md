# Cloudflare Worker source

This directory began with source snapshots fetched from the deployed Somerion Cloudflare Workers on 28 November 2026. The production Worker files now include proposed hardening changes on this branch; they are not deployed automatically and must not be assumed to match the live Workers until a controlled deployment is completed.

- `production/integration-api/worker.js` — Integration API, currently hardcoded to test-only mode.
- `production/agent-api/worker.js` — Agent API.
- `production/core-api/worker.js` — Core API.
- `production/shopify-api/worker.js` — Shopify adapter placeholder.
- `production/woocommerce-api/worker.js` — WooCommerce adapter placeholder.
- `production/social-api/worker.js` — Social adapter placeholder.
- `netlify-test-agent-api/worker.js` — isolated test Agent API; hardening changes are staged here first.

## Secret handling

Worker source may reference environment bindings such as D1 databases, AI bindings, and secret-text variables. It must never contain the values of those secrets. Keep credentials in Cloudflare Worker secret bindings. Do not export secret values into this repository, logs, chat, or browser code.

## Deployment safeguards

1. Review source changes in GitHub.
2. Run syntax, unit, and integration tests.
3. Deploy to the isolated Netlify test Worker first.
4. Verify authentication, per-user data isolation, request limits, CORS, and error handling.
5. Keep provider integrations in test-only mode until separately approved.
6. Do not deploy a production Worker from this directory without explicit release approval and a rollback plan.

These snapshots are not automatically synchronized with Cloudflare. Any dashboard-side Worker change must be brought back into this directory.

## Pending production migrations and SSRF limitation

Before deploying the hardened production Agent API or Integration API, apply the matching SQL migration in `migrations/` to that Worker's own D1 database. The Agent API, Integration API, Core API, Shopify adapter, WooCommerce adapter, and Social adapter use separate D1 databases. Apply the matching migration separately to each named database; do not assume one migration run updates the others.

The WooCommerce URL checks reject local/private literal hosts and non-HTTPS URLs, and the adapter refuses redirects. This is defense-in-depth, not a complete DNS-rebinding defense: a public hostname can still resolve to a private address. Keep `TEST_ONLY=true` and do not enable live WooCommerce requests until an outbound egress policy or verified-domain allowlist closes that gap and has been tested.

The `adapter-request-limits.sql` migration must be applied separately to the Core, Shopify, WooCommerce, and Social D1 databases listed in its comments before those hardened Worker versions are deployed.

## Static-site headers

The root `_headers` file is prepared for a host that supports Netlify/Cloudflare Pages header rules. The current production site is GitHub Pages, which does not apply this file. Do not mark static-site security headers as live until the site is served through an approved header-capable host or proxy and the deployed response headers are verified. The CSP is Report-Only at this stage and must be reviewed in a real browser before enforcement.

## Bounded autonomy engine (isolated test only)

The isolated Netlify Test Agent API now has a staged policy/approval engine in
`netlify-test-agent-api/autonomy.js`. Its schema is in
`migrations/netlify-test-agent-autonomy.sql` and must be applied only to the
isolated `somerion-netlify-test-db` database before deploying this test Worker.

The first supported actions are intentionally limited to internal workspace
operations:
- `create_task` — create a task in the signed-in user's test workspace.
- `update_task_status` — update a task owned by that user.
- `create_content_draft` — save a draft; it does not publish or send anything.

Autonomy defaults to disabled and paused. Workspace settings are opt-in,
permissions are allowlisted, daily action slots are reserved atomically, and
all decisions/actions are recorded in the workspace audit table. A pending
proposal can be explicitly approved or rejected by its authenticated owner.
Idempotency keys prevent a repeated client request from creating a second
proposal. Daily limits are also enforced when an owner approves a proposal.

These endpoints do not publish social content, send customer messages, change
advertising budgets, issue refunds, make purchases, or process payments.
Those external actions remain unsupported and must not be represented as
available. This is source code for the isolated test environment only; it is
not deployed and is not wired to the production Agent API.

The isolated Agent API also includes a scheduled task monitor. When a 15-minute
Cron Trigger is configured, it checks for unfinished tasks due within 24 hours,
respects each user's reminder preference, and inserts one persistent in-app
notification per task/due-date pair. Notifications are internal only; no email,
SMS, or external messages are sent. The Cron Trigger is configured separately
from the Worker source and must be verified after deployment.
