import assert from "node:assert/strict";
import test from "node:test";
import { contentSecurityPolicy, createCspNonce, isPrivateResponsePath, privacyResponseHeaders } from "./response-headers.ts";

test("private Silvia paths are never cached or indexed", () => {
  for (const path of ["/login", "/app", "/app/einstellungen", "/sprechen", "/api/pms-sync", "/_serverFn/abc"]) {
    assert.equal(isPrivateResponsePath(path), true, path);
    const headers = privacyResponseHeaders(path);
    assert.equal(headers["cache-control"], "no-store");
    assert.equal(headers["x-robots-tag"], "noindex, nofollow");
  }
  assert.equal(isPrivateResponsePath("/preise"), false);
  assert.equal(privacyResponseHeaders("/preise")["cache-control"], undefined);
});

test("every response gets conservative browser privacy headers", () => {
  const headers = privacyResponseHeaders("/preise");
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.equal(headers["referrer-policy"], "no-referrer");
  assert.equal(headers["permissions-policy"], "camera=(), geolocation=(), payment=(), usb=()");
  assert.equal(headers["content-security-policy"], undefined);
});

test("CSP permits only the matching per-response bootstrap nonce", () => {
  const nonce = createCspNonce();
  assert.match(nonce, /^[A-Za-z0-9+/]+={0,2}$/);
  const policy = contentSecurityPolicy(nonce);
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /media-src 'self' blob: data:/);
  assert.doesNotMatch(policy, /script-src[^;]*data:/);
  assert.ok(policy.includes(`script-src 'self' 'nonce-${nonce}'`));
  assert.doesNotMatch(policy, /script-src[^;]*unsafe-inline/);
  assert.throws(() => contentSecurityPolicy("not a nonce"), /Ungültige CSP-Nonce/);
});
