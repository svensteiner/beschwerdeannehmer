import test from "node:test";
import assert from "node:assert/strict";
import { allowComplaintRequest, allowPublicRequest, complaintRateKey, publicRateLimits, resetComplaintRateLimitForTests } from "./rate-limit.server";

function withTrustedProxy(value: string | undefined, run: () => void) {
  const previous = process.env.GARAGEN_TRUST_PROXY;
  if (value === undefined) delete process.env.GARAGEN_TRUST_PROXY;
  else process.env.GARAGEN_TRUST_PROXY = value;
  try { run(); } finally {
    if (previous === undefined) delete process.env.GARAGEN_TRUST_PROXY;
    else process.env.GARAGEN_TRUST_PROXY = previous;
  }
}

test("Rate-Limit lässt fünf synthetische Eingänge zu und blockiert den sechsten", () => {
  resetComplaintRateLimitForTests();
  const request = new Request("http://localhost/api/beschwerden", { headers: { "x-forwarded-for": "198.51.100.10" } });
  for (let i = 0; i < 5; i += 1) assert.equal(allowComplaintRequest(request, 1_000), true);
  assert.equal(allowComplaintRequest(request, 1_000), false);
  resetComplaintRateLimitForTests();
});

test("Rate-Limit öffnet nach dem Fenster wieder", () => {
  resetComplaintRateLimitForTests();
  const request = new Request("http://localhost/api/beschwerden", { headers: { "x-forwarded-for": "198.51.100.11" } });
  for (let i = 0; i < 5; i += 1) allowComplaintRequest(request, 1_000);
  assert.equal(allowComplaintRequest(request, 601_001), true);
  resetComplaintRateLimitForTests();
});

test("Vertrauenswürdige Proxy-Adressen werden nur bei ausdrücklicher Freigabe verwendet", () => {
  const request = new Request("http://localhost/api/beschwerden", { headers: { "x-forwarded-for": "198.51.100.12", "x-real-ip": "198.51.100.13" } });
  withTrustedProxy(undefined, () => assert.equal(complaintRateKey(request), "shared-untrusted-client"));
  withTrustedProxy("1", () => assert.equal(complaintRateKey(request), "198.51.100.12"));
});

test("Öffentliche Endpunkte haben getrennte Limits", () => {
  resetComplaintRateLimitForTests();
  const request = new Request("http://localhost/api/telefon/chat");
  for (let i = 0; i < publicRateLimits.telephoneChat.maxRequests; i += 1) {
    assert.equal(allowPublicRequest(request, publicRateLimits.telephoneChat, 1_000), true);
  }
  assert.equal(allowPublicRequest(request, publicRateLimits.telephoneChat, 1_000), false);
  assert.equal(allowPublicRequest(request, publicRateLimits.telephoneProtocol, 1_000), true);
  resetComplaintRateLimitForTests();
});
