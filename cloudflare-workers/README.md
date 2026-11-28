# Cloudflare Worker source

This directory contains source snapshots fetched from the deployed Somerion Cloudflare Workers on 28 November 2026.

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
