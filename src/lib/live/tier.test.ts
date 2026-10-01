import assert from "node:assert/strict";
import test from "node:test";
import { chooseVoiceTier } from "./tier";
import type { LivePolicy } from "./policy";

const ok: LivePolicy = { ok: true, httpBase: "h", wsBase: "w", zdrAttestedAt: "2026-09-01", dpaRef: "x" };
const blocked: LivePolicy = { ok: false, reasons: ["not_enabled"] };
const b = { tenantId: "t", monthKey: "2026-09", usedSeconds: 0, limitSeconds: 3600 };

test("Live-Plan mit freigegebener Politik nutzt Live", () => {
  assert.deepEqual(chooseVoiceTier({ plan: "live", policy: ok, budget: b }), { tier: "live", reason: "ok" });
});
test("Budget-Plan bleibt günstig", () => {
  assert.equal(chooseVoiceTier({ plan: "budget", policy: ok, budget: b }).tier, "budget");
});
test("gesperrte Politik, Anbieterausfall und leeres Minutenkonto fallen zurück", () => {
  assert.equal(chooseVoiceTier({ plan: "live", policy: blocked, budget: b }).reason, "policy_blocked");
  assert.equal(chooseVoiceTier({ plan: "live", policy: ok, budget: b, providerDown: true }).reason, "provider_down");
  assert.equal(chooseVoiceTier({ plan: "live", policy: ok, budget: { ...b, usedSeconds: 3600 } }).reason, "minutes_exhausted");
});
