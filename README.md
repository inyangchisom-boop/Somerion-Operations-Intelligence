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

## Data model
- users/{uid}/orders/{recordId}
- users/{uid}/products/{recordId}

Rules restrict records to the authenticated user's UID. Test rules before storing real business information.