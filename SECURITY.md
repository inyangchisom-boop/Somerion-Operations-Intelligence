# Security

## Reporting a vulnerability

Please do not publish exploit details, credentials, personal data, or a working attack in a public issue.

Report suspected vulnerabilities privately to the project owner using the repository's GitHub private vulnerability reporting feature when it is enabled. If that feature is unavailable, contact the project owner through the official business contact channel and include only the minimum information needed to reproduce the issue.

## Security boundaries

- Browser-delivered Firebase web configuration (including its API key) is public configuration, not a server secret. Restrict the key in Google Cloud Console to the required Firebase APIs and approved HTTP referrers. The current key restrictions have not been independently verified; keep the GitHub Pages and isolated Netlify testing origins on the allowlist until hosting changes are approved.
- Service-account keys, provider client secrets, SMTP credentials, encryption keys, access tokens, and signing keys must remain in managed server-side secret storage.
- Client-side visibility or hidden navigation is never an authorization boundary.
- Firestore rules and authenticated backend handlers must enforce user and owner permissions.
- Provider integrations remain in sandbox/test-only mode until reviewed and explicitly approved.
- Do not use production customer accounts or data in security tests.

## Release requirements

A passing automated scan is not a security certification. Before production release, review:
- Firebase Authentication and Firestore rules, including cross-user access tests.
- Cloudflare Worker authentication, authorization, request validation, rate limits, CORS, and error handling.
- Secret exposure in the current tree and Git history.
- Dependency advisories and supported runtime versions.
- Browser security headers and content security policy at the actual hosting edge.
- Backup, recovery, incident response, and credential rotation procedures.

Never commit real secrets. If a credential is exposed, revoke or rotate it at its provider; deleting it from the latest commit does not remove it from Git history.
