import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { describe, it } from "mocha";

const html = readFileSync("index.html", "utf8");
const app = readFileSync("assets/app.js", "utf8");
const css = readFileSync("assets/styles.css", "utf8");

describe("Somerion website quality safeguards", function () {
  it("provides the auth heading elements required by the login/register controller", function () {
    assert.ok(html.includes('<h2 id="authTitle">Welcome back.</h2>'));
    assert.ok(html.includes('<p id="authSubtitle" class="muted">Sign in to pick up where your business left off.</p>'));
    assert.ok(app.includes('$("authTitle").textContent'));
    assert.ok(app.includes('$("authSubtitle").textContent'));
  });

  it("uses unique SVG gradient identifiers", function () {
    const ids = [...html.matchAll(/id="(somerionWingGradient\d+)"/g)].map(match => match[1]);
    const refs = [...html.matchAll(/url\(#(somerionWingGradient\d+)\)/g)].map(match => match[1]);
    assert.equal(ids.length, 10);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(refs.sort(), ids.sort());
  });

  it("does not use page-wide zoom and keeps mobile navigation in document flow", function () {
    assert.doesNotMatch(css, /body\s*\{[^}]*zoom\s*:\s*1\.(?:10|15)/);
    assert.match(css, /\.site-nav\.menu-open \.site-links/);
    assert.match(css, /\.site-nav\.menu-open \.site-actions/);
    assert.match(app, /classList\.toggle\("menu-open"\)/);
    assert.doesNotMatch(app, /nav\.style\.top\s*=/);
  });

  it("submits feedback with an atomic Firestore cooldown transaction", function () {
    assert.match(app, /runTransaction\(db/);
    assert.match(app, /feedbackRateLimits/);
    assert.match(app, /lastSubmittedAt/);
    assert.match(app, /Your feedback was saved\. The list could not refresh/);
  });

  it("surfaces public review load errors without blocking the rest of the page", function () {
    assert.match(app, /Published reviews are temporarily unavailable/);
    assert.match(app, /console\.warn\("Somerion public reviews could not be loaded/);
  });
});
