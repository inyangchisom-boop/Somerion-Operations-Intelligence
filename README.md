# Somerion Operations Intelligence

Responsive ecommerce operations workspace foundation for phones, tablets and desktop browsers.

## Implemented
- Firebase email/password registration, sign-in, sign-out and password reset.
- Per-user Firestore data paths and security rules.
- Create, edit, search, filter and delete order and inventory records.
- Overview metrics calculated from the signed-in user's saved records.
- No seeded demo data or simulated third-party connections.
- Order records support an individual ISO 4217 currency code; USD is the default for new orders and legacy records without a currency.
- A searchable directory lists commerce, marketplace, accounting, payment, social, marketing, shipping, support and analytics platforms.
- A Cloudflare Worker and D1 database provide the integration API, a 47-provider registry, per-user connection status, and a generic encrypted-connection storage table. The Worker validates the signed-in user's Firebase ID token.
- WooCommerce has a manual connection and import path. Its REST credentials are encrypted at rest; the Worker verifies the store and requests its REST API. Other providers are registered with their expected authorization type but are not yet live connectors.
- The WooCommerce interface can import up to 100 recent orders and 100 products into the signed-in user's Firestore records. Imported order references use a `WC-` prefix; product SKUs use the store SKU or a `WC-` fallback. Existing matching references/SKUs are skipped on subsequent syncs.

## Separate Firebase project — required
Do not reuse the Firebase project for Somerion Sintara.
1. Create a NEW project named Somerion Operations Intelligence at https://console.firebase.google.com/.
2. Enable Email/Password in Authentication > Sign-in method.
3. Create a Cloud Firestore database in production mode.
4. Register a Web App in Project settings and copy its Firebase web configuration.
5. Replace placeholders in assets/firebase-config.js with the NEW project's values.
6. Publish firestore.rules in Firestore > Rules.
7. Add the GitHub Pages domain to Authentication > Settings > Authorized domains after deployment.
Never put service-account private keys or Admin SDK credentials in browser files.

## GitHub Pages
In repository Settings > Pages, choose Deploy from a branch, select main and /(root), then save. Expected URL:
https://inyangchisom-boop.github.io/Somerion-Operations-Intelligence/

## Not yet implemented
Provider-specific OAuth apps, API credentials, callback registrations, scopes, adapter implementations, and live data synchronization for the remaining 46 providers are still required. The registry does not mean those platforms are connected. Scheduled/background synchronization, pagination beyond the first 100 WooCommerce records, incremental updates/deletions, conflict resolution, automated sync health, cross-platform reconciliation, currency conversion, team roles, audit logs, data export/import, automated tests, monitoring, privacy/legal pages and production security review also remain. The WooCommerce path has not been tested against a real store because no test store/API credentials have been supplied. Do not treat this foundation as production-ready. Order totals display in the currency saved on each order; this does not perform currency conversion or consolidate mixed currencies into one base-currency total. This foundation must be tested and hardened before real business use.

## Backend preparation status

A Firebase Functions backend scaffold is committed under `functions/`. It contains a callable email sender that:
- Requires Firebase Authentication for verification-email requests.
- Handles password-reset requests without revealing whether an email address has an account.
- Reserves an atomic daily quota of 5 emails per Firebase user across verification and password-reset messages.
- Stores quota counters server-side in `messageUsage/{uid}/daily/{YYYY-MM-DD}_email`.
- Uses UTC calendar days. Failed delivery attempts still consume a quota slot to fail safely against abuse.
- Uses SMTP credentials stored as Firebase Secret Manager secrets, not browser code.

**This backend is prepared but not deployed or connected to the website.** The current browser app still uses Firebase Authentication's direct email-sending methods, so the 5-email server-side limit is not active yet. Do not claim the limit is enforced until the frontend is migrated to call the deployed function and the end-to-end tests pass.

Required SMTP secrets when ready:
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`.

SMS sending is not implemented because no SMS provider or SMS use case has been configured. The backend quota helper supports a separate `sms` channel; every future SMS sender must reserve that quota before sending. The intended limit is 5 SMS per user per UTC day.

Deployment requires the Firebase CLI, Node.js 22, a local development environment or equivalent, and the Blaze plan. The current user workflow is Android-only, so deployment steps must be selected carefully; do not paste provider passwords or private keys into GitHub files or chat.

## Data model
- users/{uid}/orders/{recordId}
- users/{uid}/products/{recordId}

Rules restrict records to the authenticated user's UID. Test rules before storing real business information.