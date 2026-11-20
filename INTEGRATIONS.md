# Integration rollout register

This register records the providers listed in the Somerion Operations Intelligence interface.

## Current verified implementation scope

- **WooCommerce:** a manual REST API connection and import path is implemented in the application code. It imports up to 100 recent orders and 100 products per manual sync. No real store has been provided, so a live third-party connection has not been end-to-end tested.
- **HubSpot, Airtable, and Notion:** added to the provider registry. Their provider-specific developer-app credentials, OAuth endpoints, scopes, token-exchange differences, and read-data adapters are not yet configured or tested. They are not live integrations yet.
- **PayPal Sandbox:** a separate credential form and backend verification path now exchange Sandbox client credentials for a PayPal OAuth access token, encrypt the credentials/token, and provide a read-only recent-transaction test endpoint. No Sandbox credentials have been supplied, so this flow and the transaction endpoint have not been end-to-end tested. It is not a live PayPal merchant connection.
- **Remaining providers:** the shared OAuth 2.0 + PKCE foundation is still generic and requires provider-specific setup. No provider other than WooCommerce currently has a verified production data import/sync adapter.

## Provider register

| Category | Providers |
|---|---|
| Commerce | Shopify, WooCommerce, BigCommerce, Adobe Commerce, Wix Stores, Squarespace Commerce |
| Marketplaces | Amazon Seller Central, eBay, Etsy, Walmart Marketplace, TikTok Shop, Shopee, Lazada, Mercado Libre, AliExpress |
| Accounting | QuickBooks Online, Xero, Zoho Books, Sage Accounting, FreshBooks |
| Payments | Stripe, PayPal, Square, Adyen, Razorpay |
| Social | Instagram, Facebook Pages, TikTok, YouTube, Pinterest, LinkedIn Pages |
| Marketing | Mailchimp, Klaviyo, HubSpot, Brevo, ActiveCampaign |\n| Productivity | Airtable, Notion |
| Shipping | ShipStation, Shippo, DHL, FedEx, UPS |
| Support | Zendesk, Intercom, Freshdesk |
| Analytics | Google Analytics, Google Ads, Meta Ads |

## New test connectors (2026-11-21)\n\n- Added Airtable and Notion to the provider registry and Somerion interface. Their OAuth developer-app settings and provider-specific read adapters remain to be configured.\n- Added a PayPal Sandbox credential form. The Worker validates credentials against PayPal Sandbox, stores the encrypted app credentials and short-lived token, refreshes the token when needed, and exposes a read-only transaction search for the previous seven days. This is sandbox-only and has not been tested with a real Sandbox app yet.\n- Corrected Worker request routing so the URL is initialized before route checks, the external OAuth callback is handled before API path validation, and Firebase identity is checked before authenticated integration actions. Deployment was accepted by Cloudflare; runtime/end-to-end tests are still pending.\n\n## Implemented authorization foundation (2026-11-21)

- Added a shared OAuth 2.0 authorization-code + PKCE start/callback flow to the Cloudflare Worker for providers whose registry auth type is `oauth2`.
- OAuth state is stored hashed in D1, expires after 10 minutes, and is single-use.
- Authorization tokens are encrypted with the existing AES-GCM Worker key before being stored in `integration_connections`.
- Added a Connect action in the platform directory for OAuth-type providers.
- Added the D1 `oauth_states` table and index.
- The callback is `https://somerion-integration-api.somerion-oi.workers.dev/oauth/callback`.

**This is an authorization framework, not 46 completed provider integrations.** No provider OAuth app credentials have been configured, and no OAuth account has been connected or tested. OAuth scopes, authorize/token endpoints, provider-specific required parameters, token refresh, account identity lookup, data APIs, pagination, webhooks, and sync adapters still need provider-specific implementation and verification. Providers marked `api_key` or `signed_api` do not use this OAuth route.

For an OAuth provider, the Worker expects these secret/text bindings (configured in Cloudflare Worker settings, never in GitHub or chat):

- `OAUTH_<PROVIDER_ID>_CLIENT_ID`
- `OAUTH_<PROVIDER_ID>_CLIENT_SECRET`
- `OAUTH_<PROVIDER_ID>_AUTHORIZE_URL`
- `OAUTH_<PROVIDER_ID>_TOKEN_URL`
- Optional: `OAUTH_<PROVIDER_ID>_SCOPES`
- Optional JSON: `OAUTH_<PROVIDER_ID>_AUTH_PARAMS`

Replace hyphens in provider IDs with underscores and uppercase them (example: `shopify` becomes `OAUTH_SHOPIFY_CLIENT_ID`). The exact redirect URI must be registered with each provider. Some providers require different OAuth parameters or token exchange methods and cannot be enabled by setting these variables alone.

## Shared backend

- Cloudflare Worker: `somerion-integration-api`
- D1 database: `somerion-operations-db`
- Per-user generic connection table: `integration_connections`
- Existing WooCommerce table: `woo_connections`
- User identity: Firebase ID token, verified-email account required.
- Credential encryption: AES-GCM using a Worker secret. Secret values are not stored in this repository.

## Requirements before activating each provider

1. Verify the provider's current official API and developer terms.
2. Create/register a Somerion developer application where required.
3. Obtain the correct client ID, client secret, API key, signing key, or other provider credentials.
4. Configure exact redirect/callback URLs, allowed scopes, and webhook URLs.
5. Implement and test the provider-specific authorization exchange and token refresh/revocation flow.
6. Implement read-only data adapters first, including pagination, rate limits, retries, timestamps, and currency/status mapping.
7. Test with a real authorized account and confirm per-user data isolation before showing a Connected status.

Authentication labels in the Worker registry are planning metadata only. They are not a substitute for checking each provider's current official API documentation.

## Safety and status

- Never paste API secrets into chat or commit them to GitHub.
- Do not enable writes to a customer's commerce, accounting, payment, or social account without a separate explicit permission design.
- A provider being listed or registered does not mean its live integration exists.
- Do not enable automatic/background sync until pagination, rate limits, retries, duplicate handling, deletion behavior, and monitoring have been tested.
