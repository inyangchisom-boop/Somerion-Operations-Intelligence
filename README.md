# Somerion Operations Intelligence

Responsive ecommerce operations workspace foundation for phones, tablets and desktop browsers.

## Implemented
- Firebase email/password registration, sign-in, sign-out and password reset.
- Per-user Firestore data paths and security rules.
- Create, edit, search, filter and delete order and inventory records.
- Overview metrics calculated from the signed-in user's saved records.
- No seeded demo data or simulated third-party connections.
- Shopify and QuickBooks are explicitly marked **Not connected**.

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
Shopify/QuickBooks OAuth, server-side token storage, live synchronization, social integrations, team roles, audit logs, data export/import, automated tests, monitoring, privacy/legal pages and production security review. These are not represented as working. Monetary totals currently display in USD. This foundation must be tested and hardened before real business use.

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