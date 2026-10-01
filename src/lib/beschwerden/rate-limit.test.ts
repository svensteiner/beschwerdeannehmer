import test from "node:test";
import assert from "node:assert/strict";
import { allowComplaintRequest, resetComplaintRateLimitForTests } from "./rate-limit.server";

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
