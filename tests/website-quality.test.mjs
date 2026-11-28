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

  it("keeps HTML IDs unique and JavaScript DOM lookups resolvable", function () {
    const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(htmlIds).size, htmlIds.length, "HTML element IDs must be unique");

    const dynamicIds = new Set([
      "wooConnectButton",
      "wooSyncButton",
      "paypalConnectButton",
      "paypalTestButton"
    ]);
    const optionalIds = new Set(["labNav"]);
    const referencedIds = [...new Set(
      [...app.matchAll(/\$\(["']([^"']+)["']\)/g)].map(match => match[1])
    )];
    const unresolved = referencedIds.filter(id =>
      !htmlIds.includes(id) && !dynamicIds.has(id) && !optionalIds.has(id)
    );
    assert.deepEqual(unresolved, [], "Static JavaScript lookups must exist in index.html");

    for (const id of dynamicIds) {
      assert.ok(app.includes('id="' + id + '"'), id + " must be created by the integration renderer");
    }
    assert.ok(app.includes('if($("labNav"))$("labNav").hidden=true'));
  });

  it("does not expose the owner UID in browser code and asks the backend for moderation access", function () {
    assert.doesNotMatch(app, /OWNER_UID|MnTpG1cRJETCZMs8fbg6tDMkRvA2/);
    assert.ok(app.includes('INTEGRATION_API+"/api/lab/access"'));
    assert.ok(app.includes("await hasOwnerAccess()"));
    assert.ok(app.includes("ownerAccess=result.isOwner===true&&result.labAccess===true"));
    assert.ok(app.includes("const requestUid=user.uid"));
    assert.ok(app.includes("ownerAccessUid!==requestUid"));
  });

  it("escapes user-controlled HTML output and uses textContent for chat", function () {
    const escapeLine = app.split("\n").find(line => line.startsWith("const esc="));
    assert.ok(escapeLine, "a shared HTML-escaping function must exist");
    const escapeHtml = new Function("return (" + escapeLine.slice("const esc=".length).replace(/;$/, "") + ");")();
    assert.equal(
      escapeHtml('<img src=x onerror="alert(1)"> & \'quoted\''),
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quoted&#39;"
    );
    assert.ok(app.includes("esc(t.title)"));
    assert.ok(app.includes("esc(t.details)"));
    assert.ok(app.includes("esc(n.message)"));
    assert.ok(app.includes('esc(item.message||"")'));
    assert.ok(app.includes("esc(v)"));
    assert.ok(app.includes("el.textContent=message"));
    assert.ok(!app.includes("eval("));
    assert.ok(!app.includes("new Function("));
    assert.ok(!app.includes("document.write("));
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
