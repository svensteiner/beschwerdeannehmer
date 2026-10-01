import assert from "node:assert/strict";
import { test } from "node:test";
import { STUB_KIND, VQUADRAT_KIND, VQUADRAT_LABEL } from "../praxissoftware.ts";
import { adapterFor, listAdapters, registerAdapter } from "./adapters.ts";

test("unknown kind or label resolves to a notConnected stub, never null, never throws", async () => {
  const adapter = adapterFor("vetera", {});
  assert.equal(adapter.kind, STUB_KIND);
  assert.equal(adapter.label, "vetera");
  assert.deepEqual(await adapter.health(), { ok: false, reason: "notConnected" });
  assert.deepEqual(adapter.sendAkte({ pet: "Bella" }), { ok: false, reason: "notConnected" });

  const empty = adapterFor("", {});
  assert.equal(empty.kind, STUB_KIND);
  assert.equal(empty.label, "Unbekannt");
});

test("vquadrat resolves by kind and stays a stub without SILVIA_PMS_URL", async () => {
  const adapter = adapterFor(VQUADRAT_KIND, {});
  assert.equal(adapter.kind, VQUADRAT_KIND);
  assert.equal(adapter.label, VQUADRAT_LABEL);
  assert.deepEqual(await adapter.health(), { ok: false, reason: "notConnected" });
});

test("vquadrat stays a local stub when the connector URL has no credential", async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async () => {
    calls++;
    throw new Error("A connector without a credential must not be contacted");
  }) as typeof fetch;

  const adapter = adapterFor(VQUADRAT_KIND, { SILVIA_PMS_URL: "http://127.0.0.1:8765", SILVIA_PMS_TOKEN: "  " });
  assert.deepEqual(await adapter.health(), { ok: false, reason: "notConnected" });
  assert.equal(calls, 0);
});

test("vquadrat resolves by label (praxissoftwareKindOf) too", async () => {
  const adapter = adapterFor(VQUADRAT_LABEL, {});
  assert.equal(adapter.kind, VQUADRAT_KIND);
  assert.equal(adapter.label, VQUADRAT_LABEL);
});

test("vquadrat with SILVIA_PMS_URL set talks to silvia-connector via fetch", async (t) => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input: string | URL) => {
    calls.push(String(input));
    return new Response(
      JSON.stringify({ ok: true, adapter: "vquadrat", readOnly: true, version: "0.1.0" }),
      { status: 200 },
    );
  }) as typeof fetch;

  const adapter = adapterFor(VQUADRAT_KIND, {
    SILVIA_PMS_URL: "http://127.0.0.1:8765",
    SILVIA_PMS_TOKEN: "secret-token",
  });
  const health = await adapter.health();
  assert.deepEqual(health, {
    ok: true,
    data: { ok: true, adapter: "vquadrat", readOnly: true, version: "0.1.0" },
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0] ?? "", /\/health$/);
});

test("SILVIA_PMS_KIND overrides the label lookup when it names a registered kind", async () => {
  // "vetera" as a label would normally resolve to the stub; the override forces vquadrat.
  const adapter = adapterFor("vetera", { SILVIA_PMS_KIND: VQUADRAT_KIND });
  assert.equal(adapter.kind, VQUADRAT_KIND);
  assert.equal(adapter.label, VQUADRAT_LABEL);
});

test("SILVIA_PMS_KIND is ignored when it names an unregistered kind", async () => {
  const adapter = adapterFor(VQUADRAT_KIND, { SILVIA_PMS_KIND: "not-registered" });
  assert.equal(adapter.kind, VQUADRAT_KIND);
});

test("listAdapters lists registered factories, at least vquadrat", () => {
  const list = listAdapters();
  assert.ok(list.some((a) => a.kind === VQUADRAT_KIND && a.label === VQUADRAT_LABEL));
});

test("registerAdapter is idempotent by kind (safe against dev HMR double-registration)", () => {
  const before = listAdapters().length;
  registerAdapter({ kind: VQUADRAT_KIND, label: VQUADRAT_LABEL, create: () => adapterFor(VQUADRAT_KIND, {}) });
  registerAdapter({ kind: VQUADRAT_KIND, label: VQUADRAT_LABEL, create: () => adapterFor(VQUADRAT_KIND, {}) });
  assert.equal(listAdapters().length, before);
});

test("a future vendor can register without changing the central registry", async () => {
  const kind = "synthetic-future-vet";
  const label = "Synthetic Future Vet";
  registerAdapter({
    kind,
    label,
    create: () => adapterFor("unconfigured-future-vet", {}),
  });

  assert.ok(listAdapters().some((adapter) => adapter.kind === kind && adapter.label === label));
  const adapter = adapterFor(kind, {});
  assert.equal(adapter.kind, STUB_KIND);
  assert.deepEqual(await adapter.health(), { ok: false, reason: "notConnected" });
});
