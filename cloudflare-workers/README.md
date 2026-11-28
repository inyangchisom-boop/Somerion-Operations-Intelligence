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
