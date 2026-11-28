import { strict as assert } from "node:assert";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "mocha";
import agentWorker from "../cloudflare-workers/netlify-test-agent-api/worker.js";
import integrationWorker from "../cloudflare-workers/netlify-test-integration-api/worker.js";
import coreWorker from "../cloudflare-workers/production/core-api/worker.js";
import shopifyWorker from "../cloudflare-workers/production/shopify-api/worker.js";
import woocommerceWorker from "../cloudflare-workers/production/woocommerce-api/worker.js";
import socialWorker from "../cloudflare-workers/production/social-api/worker.js";

const PROJECT_ID = "somerion-oi-testing";
const ORIGIN = "https://somerion-operations-intelligence.netlify.app";
const originalFetch = globalThis.fetch;
let privateKey, jwk;

function b64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}
async function makeToken(emailVerified = true, uid = "test-user-1", projectId = PROJECT_ID) {
  const header = b64url(Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-signing-key" })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(Buffer.from(JSON.stringify({
    aud: projectId,
    iss: "https://securetoken.google.com/" + projectId,
    sub: uid,
    email: uid + "@example.test",
    email_verified: emailVerified,
    iat: now,
    exp: now + 3600,
    auth_time: now
  })));
  const data = new TextEncoder().encode(header + "." + payload);
  const signature = await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, data);
  return header + "." + payload + "." + b64url(new Uint8Array(signature));
}
function mockEnv() {
  const counts = new Map();
  const statements = [];
  const DB = {
    prepare(sql) {
      return {
        bind(...params) {
          statements.push({ sql, params });
          return {
            async first() {
              if (sql.includes("INSERT INTO request_limits")) {
                const key = String(params[0]) + ":" + String(params[1]);
                const count = (counts.get(key) || 0) + 1;
                counts.set(key, count);
                return { count };
              }
              if (sql.includes("SELECT COUNT(*) AS total")) return { total: 0 };
              if (sql.includes("SELECT reminders_enabled")) return null;
              return null;
            },
            async all() { return { results: [] }; },
            async run() { return { meta: { changes: 1 } }; }
          };
        }
      };
    }
  };
  return { DB, statements };
}
function request(path, token, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", "Bearer " + token);
  if (options.origin !== false) headers.set("Origin", options.origin || ORIGIN);
  return new Request("https://test-worker.example" + path, {
    method: options.method || "GET",
    headers,
    body: options.body
  });
}

describe("Cloudflare Worker security controls (isolated test Workers)", function () {
  before(async function () {
    const pair = await webcrypto.subtle.generateKey({
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    }, true, ["sign", "verify"]);
    privateKey = pair.privateKey;
    jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
    jwk.kid = "test-signing-key";
    jwk.alg = "RS256";
    jwk.use = "sig";
    globalThis.fetch = async (input, init) => {
      if (String(input).includes("service_accounts/v1/jwk/securetoken")) {
        return new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return originalFetch(input, init);
    };
  });

  after(function () {
    globalThis.fetch = originalFetch;
  });

  it("rate-limits unauthenticated Agent API requests by source IP", async function () {
    const env = mockEnv();
    let last;
    for (let i = 0; i < 61; i++) {
      last = await agentWorker.fetch(request("/v1/tasks", null, {
        headers: { "CF-Connecting-IP": "198.51.100.44" }
      }), env);
    }
    assert.equal(last.status, 429);
  });

  it("rate-limits unauthenticated Integration API requests by source IP", async function () {
    const env = mockEnv();
    let last;
    for (let i = 0; i < 61; i++) {
      last = await integrationWorker.fetch(request("/api/integrations", null, {
        headers: { "CF-Connecting-IP": "198.51.100.45" }
      }), env);
    }
    assert.equal(last.status, 429);
  });

  it("rejects unauthenticated Agent API requests", async function () {
    const res = await agentWorker.fetch(request("/v1/tasks", null), mockEnv());
    assert.equal(res.status, 401);
  });

  it("includes security headers on Agent API preflight responses", async function () {
    const res = await agentWorker.fetch(request("/v1/tasks", null, { method: "OPTIONS" }), mockEnv());
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
  });

  it("rejects unverified Firebase accounts", async function () {
    const token = await makeToken(false);
    const res = await agentWorker.fetch(request("/v1/tasks", token), mockEnv());
    assert.equal(res.status, 401);
  });

  it("rejects disallowed browser origins", async function () {
    const res = await agentWorker.fetch(request("/v1/tasks", null, { origin: "https://attacker.example" }), mockEnv());
    assert.equal(res.status, 403);
  });

  it("returns no-store and baseline security headers from the Agent API", async function () {
    const res = await agentWorker.fetch(request("/health", null), mockEnv());
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
  });

  it("rejects oversized JSON bodies before processing them", async function () {
    const token = await makeToken(true);
    const env = mockEnv();
    const res = await agentWorker.fetch(request("/v1/tasks", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x".repeat(17000) })
    }), env);
    assert.equal(res.status, 413);
  });

  it("limits Agent API requests per user and per minute", async function () {
    const token = await makeToken(true, "rate-limit-user");
    const env = mockEnv();
    let last;
    for (let i = 0; i < 61; i++) {
      last = await agentWorker.fetch(request("/v1/tasks", token, {
        headers: { "CF-Connecting-IP": "198.51.100." + (i + 1) }
      }), env);
    }
    assert.equal(last.status, 429);
  });

  it("scopes Agent API task queries to the authenticated user", async function () {
    const token = await makeToken(true, "user-scope-check");
    const env = mockEnv();
    const res = await agentWorker.fetch(request("/v1/tasks", token), env);
    assert.equal(res.status, 200);
    const taskQuery = env.statements.find(x => x.sql.includes("FROM agent_tasks WHERE uid=?"));
    assert.ok(taskQuery);
    assert.equal(taskQuery.params[0], "user-scope-check");
  });

  it("rejects unsafe WooCommerce URL forms before any outbound request", function () {
    const source = readFileSync("cloudflare-workers/production/integration-api/worker.js", "utf8");
    const helperLine = source.split("\\n").find(line => line.startsWith("function httpsStore(v)"));
    assert.ok(helperLine, "WooCommerce URL validator must exist");
    const httpsStore = new Function(helperLine + "; return httpsStore;")();
    assert.equal(httpsStore("https://store.example.com"), true);
    for (const url of [
      "http://store.example.com",
      "https://localhost",
      "https://127.0.0.1",
      "https://10.0.0.8",
      "https://192.168.1.2",
      "https://127.0.0.1.nip.io",
      "https://store.example.com:8443",
      "https://store.example.com/private-path",
      "https://user:pass@store.example.com"
    ]) assert.equal(httpsStore(url), false, url);
    assert.ok(source.includes('redirect:"manual"'), "WooCommerce redirects must not be followed");
  });

  it("protects all production adapter endpoints with verified Firebase tokens and security headers", async function () {
    const token = await makeToken(true, "adapter-user", "somerion-oi");
    for (const worker of [coreWorker, shopifyWorker, woocommerceWorker, socialWorker]) {
      const res = await worker.fetch(request("/v1/status", token, { origin: "https://inyangchisom-boop.github.io" }), mockEnv());
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
      assert.equal(res.headers.get("cache-control"), "no-store");
    }
  });

  it("includes security headers on adapter preflight responses", async function () {
    const res = await coreWorker.fetch(request("/v1/status", null, {
      origin: "https://inyangchisom-boop.github.io",
      method: "OPTIONS"
    }), mockEnv());
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
  });

  it("rejects unverified users on the Core API", async function () {
    const token = await makeToken(false, "unverified-adapter-user", "somerion-oi");
    const res = await coreWorker.fetch(request("/v1/status", token, { origin: "https://inyangchisom-boop.github.io" }), mockEnv());
    assert.equal(res.status, 401);
  });

  it("rate-limits unauthenticated Core API requests by source IP", async function () {
    const env = mockEnv();
    let last;
    for (let i = 0; i < 61; i++) {
      last = await coreWorker.fetch(request("/v1/status", null, {
        origin: "https://inyangchisom-boop.github.io",
        headers: { "CF-Connecting-IP": "198.51.100.46" }
      }), env);
    }
    assert.equal(last.status, 429);
  });

  it("bounds Core API workspace request bodies", async function () {
    const token = await makeToken(true, "workspace-body-user", "somerion-oi");
    const res = await coreWorker.fetch(request("/v1/workspaces", token, {
      origin: "https://inyangchisom-boop.github.io",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x".repeat(17000) })
    }), mockEnv());
    assert.equal(res.status, 413);
  });

  it("scopes Core API workspace queries to the authenticated user", async function () {
    const token = await makeToken(true, "workspace-scope-user", "somerion-oi");
    const env = mockEnv();
    const res = await coreWorker.fetch(request("/v1/workspaces", token, { origin: "https://inyangchisom-boop.github.io" }), env);
    assert.equal(res.status, 200);
    const query = env.statements.find(x => x.sql.includes("FROM workspaces WHERE user_id=?"));
    assert.ok(query);
    assert.equal(query.params[0], "workspace-scope-user");
  });

  it("rejects unauthenticated Integration API requests", async function () {
    const res = await integrationWorker.fetch(request("/api/integrations", null), mockEnv());
    assert.equal(res.status, 401);
  });

  it("keeps provider actions disabled in the isolated Integration API", async function () {
    const token = await makeToken(true, "integration-test-user");
    const env = mockEnv();
    const res = await integrationWorker.fetch(request("/api/integrations/shopify/connect", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    }), env);
    assert.equal(res.status, 409);
    assert.equal(env.statements.some(x => x.sql.includes("INSERT INTO integration_connections")), false);
  });

  it("limits Integration API request bodies", async function () {
    const token = await makeToken(true, "integration-body-user");
    const res = await integrationWorker.fetch(request("/api/activity", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "login", details: "x".repeat(17000) })
    }), mockEnv());
    assert.equal(res.status, 413);
  });
});
