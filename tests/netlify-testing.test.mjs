import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, config, rules, html, css] = await Promise.all([
  readFile(new URL("../assets/app.js", import.meta.url), "utf8"),
  readFile(new URL("../assets/firebase-config.js", import.meta.url), "utf8"),
  readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../assets/styles.css", import.meta.url), "utf8")
]);

test("testing frontend uses only isolated testing APIs", () => {
  assert.match(app, /somerion-netlify-test-integration-api/);
  assert.match(app, /somerion-netlify-test-agent-api/);
  assert.doesNotMatch(app, /somerion-integration-api\.somerion-oi\.workers\.dev/);
  assert.doesNotMatch(app, /somerion-agent-api-v1\.somerion-oi\.workers\.dev/);
});

test("testing Firebase config targets the isolated project", () => {
  assert.match(config, /projectId:\s*"somerion-oi-testing"/);
  assert.match(config, /authDomain:\s*"somerion-oi-testing\.firebaseapp\.com"/);
  assert.doesNotMatch(config, /projectId:\s*"somerion-oi"/);
});

test("Firestore rules scope user data to its owner and deny unknown paths", () => {
  assert.match(rules, /request\.auth\.uid == userId/);
  assert.match(rules, /match \/users\/{userId}\/orders\/{recordId}/);
  assert.match(rules, /match \/users\/{userId}\/products\/{recordId}/);
  assert.match(rules, /allow read, write: if false/);
});

test("provider UI does not claim unavailable providers are connected", () => {
  assert.match(app, /PayPal Sandbox adapter is not configured/);
  assert.match(app, /Test-only mode: live WooCommerce store connections/);
  assert.match(app, /Somerion developer-app setup required/);
});

test("task helper accurately discloses model limitation", () => {
  assert.match(html, /AI model connection is not enabled in this testing environment/);
  assert.match(app, /aiModelEnabled:false/);
});

test("mobile navigation is keyboard/screen-reader stateful and flow-based", () => {
  assert.match(html, /aria-expanded="false"/);
  assert.match(app, /setAttribute\("aria-expanded",String\(open\)\)/);
  assert.match(css, /\.site-nav\.menu-open \.site-links/);
  assert.doesNotMatch(app, /nav\.style\.position="absolute"/);
});
