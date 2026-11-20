# Integration rollout register

This register records the providers listed in the Somerion Operations Intelligence interface.

## Current verified implementation scope

- **WooCommerce:** a manual REST API connection and import path is implemented in the application code. It imports up to 100 recent orders and 100 products per manual sync. No real store has been provided, so a live third-party connection has not been end-to-end tested.
- **Other providers:** all 46 remain incomplete as end-to-end data integrations. The shared OAuth 2.0 + PKCE authorization foundation is deployed for registry entries marked `oauth2`, but no provider apps are configured and no account has been connected. API-key and signed-API providers still require individual credential forms and provider-specific validation. No provider other than WooCommerce currently has a working data import/sync adapter.

## Provider register

| Category | Providers |
|---|---|
| Commerce | Shopify, WooCommerce, BigCommerce, Adobe Commerce, Wix Stores, Squarespace Commerce |
| Marketplaces | Amazon Seller Central, eBay, Etsy, Walmart Marketplace, TikTok Shop, Shopee, Lazada, Mercado Libre, AliExpress |
| Accounting | QuickBooks Online, Xero, Zoho Books, Sage Accounting, FreshBooks |
| Payments | Stripe, PayPal, Square, Adyen, Razorpay |
| Social | Instagram, Facebook Pages, TikTok, YouTube, Pinterest, LinkedIn Pages |
| Marketing | Mailchimp, Klaviyo, HubSpot, Brevo, ActiveCampaign |
| Shipping | ShipStation, Shippo, DHL, FedEx, UPS |
| Support | Zendesk, Intercom, Freshdesk |
| Analytics | Google Analytics, Google Ads, Meta Ads |

## Implemented authorization foundation (2026-11-21)

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
