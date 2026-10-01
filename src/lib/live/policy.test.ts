import assert from "node:assert/strict";
import test from "node:test";
import { LIVE_POLICY_TEXT, parseLiveBaseUrl, resolveLivePolicy } from "./policy";

const NOW = new Date("2026-09-29T10:00:00Z");
const good = {
  SILVIA_LIVE_PROD_ENABLED: "1",
  OPENAI_API_KEY: "sk-test",
  SILVIA_LIVE_BASE_URL: "https://eu.api.openai.com/v1",
  SILVIA_LIVE_ZDR_ATTESTED: "2026-09-01",
  SILVIA_LIVE_DPA_REF: "DPA-2026-001",
  SILVIA_DATA_REGION: "AT",
  DATABASE_URL: "postgres://x",
};

test("vollständige Konfiguration ist freigegeben und nutzt den EU-Host", () => {
  const p = resolveLivePolicy(good, NOW);
  assert.equal(p.ok, true);
  if (p.ok) {
    assert.equal(p.httpBase, "https://eu.api.openai.com/v1");
    assert.equal(p.wsBase, "wss://eu.api.openai.com/v1");
  }
});

test("leere Umgebung ist gesperrt und nennt alle Gründe", () => {
  const p = resolveLivePolicy({}, NOW);
  assert.equal(p.ok, false);
  if (!p.ok) for (const r of ["not_enabled", "no_api_key", "zdr_not_attested", "dpa_missing", "data_region_not_at"] as const) assert.ok(p.reasons.includes(r), r);
});

test("jede einzelne fehlende Bedingung sperrt", () => {
  for (const key of Object.keys(good)) {
    const env: Record<string, string | undefined> = { ...good };
    delete env[key];
    assert.equal(resolveLivePolicy(env, NOW).ok, false, key);
  }
});

test("nur der EU-Host ist erlaubt", () => {
  for (const url of ["https://api.openai.com/v1", "https://evil.example/v1", "http://eu.api.openai.com/v1", "https://eu.api.openai.com:8443/v1", "https://u:p@eu.api.openai.com/v1", "https://eu.api.openai.com/other", "https://eu.api.openai.com.evil.com/v1"]) {
    assert.equal(parseLiveBaseUrl(url).ok, false, url);
  }
  assert.equal(parseLiveBaseUrl("https://eu.api.openai.com").ok, true);
});

test("Proxy sperrt Live", () => {
  const p = resolveLivePolicy({ ...good, HTTPS_PROXY: "http://proxy:3128" }, NOW);
  assert.equal(p.ok, false);
});

test("ZDR-Datum: Zukunft und über ein Jahr alt sperren", () => {
  assert.equal(resolveLivePolicy({ ...good, SILVIA_LIVE_ZDR_ATTESTED: "2027-01-01" }, NOW).ok, false);
  const stale = resolveLivePolicy({ ...good, SILVIA_LIVE_ZDR_ATTESTED: "2025-01-01" }, NOW);
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.ok(stale.reasons.includes("zdr_attestation_stale"));
  assert.equal(resolveLivePolicy({ ...good, SILVIA_LIVE_ZDR_ATTESTED: "kein-datum" }, NOW).ok, false);
});

test("Demo-Sandbox und Produktiv schließen sich aus", () => {
  assert.equal(resolveLivePolicy({ ...good, SILVIA_LIVE_DEMO_SANDBOX: "1" }, NOW).ok, false);
});

test("jeder Grund hat einen deutschen Klartext", () => {
  const p = resolveLivePolicy({}, NOW);
  if (!p.ok) for (const r of p.reasons) assert.ok(LIVE_POLICY_TEXT[r].length > 5);
});

test("Live-Sitzung nutzt den EU-Host, sperrt fremde Hosts und bleibt sonst bei der Demo", async () => {
  const { liveDemoEndpoints } = await import("../live-demo.server");
  assert.equal(liveDemoEndpoints({}).ok, true);
  const eu = liveDemoEndpoints({ SILVIA_LIVE_BASE_URL: "https://eu.api.openai.com/v1" });
  assert.ok(eu.ok && eu.http === "https://eu.api.openai.com/v1" && eu.ws === "wss://eu.api.openai.com/v1");
  assert.equal(liveDemoEndpoints({ SILVIA_LIVE_BASE_URL: "https://evil.example/v1" }).ok, false);
});
