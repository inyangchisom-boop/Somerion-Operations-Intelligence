# Integration rollout register

This register records the providers listed in the Somerion Operations Intelligence interface.

## Current verified implementation scope

- **WooCommerce:** a manual REST API connection and import path is implemented in the application code. It imports up to 100 recent orders and 100 products per manual sync. No real store has been provided, so a live third-party connection has not been end-to-end tested.
- **Other providers:** registered in the integration API with per-user connection-status lookup and disconnect storage support. Their provider-specific OAuth/API authorization, scopes, callback configuration, data adapters, and synchronization are not yet implemented. They must not be represented as connected.

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
