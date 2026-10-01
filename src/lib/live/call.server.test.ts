import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { demoDesk } from "../alma/desk";
import type { LiveBudget } from "./budget";
import { __resetLiveCallStateForTests, startLiveCall, type LiveCallDeps } from "./call.server";

const ENV = {
  SILVIA_LIVE_PROD_ENABLED: "1",
  OPENAI_API_KEY: "sk-test",
  SILVIA_LIVE_BASE_URL: "https://eu.api.openai.com/v1",
  SILVIA_LIVE_ZDR_ATTESTED: "2026-09-01",
  SILVIA_LIVE_DPA_REF: "DPA-1",
  SILVIA_DATA_REGION: "AT",
  DATABASE_URL: "postgres://x",
};
const NOW = new Date("2026-09-30T10:00:00Z");
const profile = { id: "praxis-1", name: "Tierarztpraxis Muster", hours: [{ day: "Mo–Fr", time: "8–12" }], nachtdienstPhone: "0316 123456" };

class FakeSocket extends EventEmitter {
  static OPEN = 1;
  readyState = 1;
  sent: Array<Record<string, unknown>> = [];
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
}

function setup(overrides: Partial<LiveCallDeps> = {}) {
  __resetLiveCallStateForTests();
  const sockets: FakeSocket[] = [];
  const timers: Array<{ fn: () => void; ms: number; live: boolean }> = [];
  const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const audits: unknown[] = [];
  const persisted: Array<{ user: string; action: { type: string } }> = [];
  const budgets = new Map<string, LiveBudget>();
  const deps: Partial<LiveCallDeps> = {
    env: ENV,
    now: () => NOW,
    budgets,
    loadProfile: async (slug) => (slug === "muster" ? profile : null),
    deskFor: async (slug) => (slug === "muster" ? demoDesk() : null),
    fetch: (async (url: string, init: { body: string }) => {
      fetchCalls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ session: { id: "sess-1" }, transport: { sdp: "ANSWER" } }) };
    }) as never,
    WebSocket: class extends FakeSocket { constructor() { super(); sockets.push(this); } } as never,
    setTimeout: ((fn: () => void, ms: number) => { const t = { fn, ms, live: true }; timers.push(t); return t; }) as never,
    clearTimeout: ((t: { live: boolean }) => { if (t) t.live = false; }) as never,
    persist: async (input) => { persisted.push({ user: input.user, action: input.action }); },
    audit: (record) => audits.push(record),
    ...overrides,
  };
  const fire = (ms: number) => timers.filter((t) => t.live && t.ms === ms).forEach((t) => { t.live = false; t.fn(); });
  return { deps, sockets, fetchCalls, audits, persisted, budgets, fire };
}
(FakeSocket as unknown as { OPEN: number }).OPEN = 1;

const say = (s: FakeSocket, delta: string) => s.emit("message", JSON.stringify({ type: "session.input_transcript.delta", delta }));

test("gesperrte Politik meldet nur den Rückfall und ruft OpenAI nicht an", async () => {
  const t = setup({ env: { ...ENV, SILVIA_LIVE_PROD_ENABLED: "0" } });
  const r = await startLiveCall({ slug: "muster", sdp: "v=0" }, t.deps);
  assert.equal(r.status, 503);
  assert.equal(r.body.fallback, true);
  assert.equal(t.fetchCalls.length, 0);
  assert.doesNotMatch(JSON.stringify(r.body), /ZDR|DPA|not_enabled/);
});

test("unbekannte Leitung ist 404", async () => {
  const t = setup();
  assert.equal((await startLiveCall({ slug: "fremd", sdp: "v=0" }, t.deps)).status, 404);
});

test("leeres Minutenkonto fällt auf die lokale Stimme zurück", async () => {
  const t = setup();
  t.budgets.set("praxis-1", { tenantId: "praxis-1", monthKey: "2026-09", usedSeconds: 36000, limitSeconds: 36000 });
  const r = await startLiveCall({ slug: "muster", sdp: "v=0" }, t.deps);
  assert.equal(r.status, 503);
  assert.equal(r.body.reason, "minutes_exhausted");
  assert.equal(t.fetchCalls.length, 0);
});

test("Start: EU-Host, store:false, KI-Ansage im Prompt, Sideband bekommt die Begrüßung", async () => {
  const t = setup();
  const r = await startLiveCall({ slug: "muster", sdp: "v=0" }, t.deps);
  assert.equal(r.status, 201);
  assert.equal(t.fetchCalls[0]?.url, "https://eu.api.openai.com/v1/live/sessions");
  const session = t.fetchCalls[0]?.body.session as { store: boolean; instructions: string };
  assert.equal(session.store, false);
  assert.match(session.instructions, /digitalen Assistentin von Tierarztpraxis Muster/);
  t.sockets[0]?.emit("open");
  assert.equal(t.sockets[0]?.sent[0]?.type, "session.instructions.append");
});

test("Anruf: Äußerung wird beantwortet, protokolliert; Ende schreibt Audit ohne Klartext und bucht Minuten", async () => {
  const t = setup();
  await startLiveCall({ slug: "muster", sdp: "v=0" }, t.deps);
  const s = t.sockets[0]!;
  s.emit("open");
  say(s, "Ich möchte einen Termin für Bella");
  t.fire(900);
  const spoken = s.sent.find((m) => m.type === "session.commentary.append" && String(m.event_id).startsWith("silvia-turn"));
  assert.ok(spoken, "Antwort wurde an Live gegeben");
  await new Promise((r) => setImmediate(r));
  assert.ok(t.persisted.length >= 1, "Tafel-Protokoll geschrieben");
  s.emit("message", JSON.stringify({ type: "session.closed", reason: "remote_hangup", usage: { seconds: 95 } }));
  assert.equal(t.audits.length, 1);
  const audit = t.audits[0] as Record<string, unknown>;
  assert.equal(audit.audioStored, false);
  assert.equal(audit.transcriptStored, false);
  assert.doesNotMatch(JSON.stringify(audit), /Bella|Termin/);
  assert.equal(t.budgets.get("praxis-1")?.usedSeconds, 95);
});

test("Notfall: sofortige Übergabe, danach schließt die Sitzung und das Audit markiert es", async () => {
  const t = setup();
  await startLiveCall({ slug: "muster", sdp: "v=0" }, t.deps);
  const s = t.sockets[0]!;
  say(s, "Mein Hund atmet nicht mehr");
  t.fire(900);
  t.fire(6000);
  assert.ok(s.sent.some((m) => m.type === "session.close"));
  s.emit("message", JSON.stringify({ type: "session.closed", reason: "close_requested", usage: { seconds: 20 } }));
  assert.equal((t.audits[0] as { emergencyHandoff: boolean }).emergencyHandoff, true);
});

test("Gleichzeitige Anrufe sind begrenzt", async () => {
  const t = setup({ env: { ...ENV, SILVIA_LIVE_MAX_CONCURRENT: "1" } });
  assert.equal((await startLiveCall({ slug: "muster", sdp: "v=0" }, t.deps)).status, 201);
  const second = await startLiveCall({ slug: "muster", sdp: "v=0" }, t.deps);
  assert.equal(second.status, 429);
  assert.equal(second.body.fallback, true);
  t.sockets[0]!.emit("message", JSON.stringify({ type: "session.closed", usage: { seconds: 5 } }));
  assert.equal((await startLiveCall({ slug: "muster", sdp: "v=0" }, t.deps)).status, 201);
});

test("Fehler bei OpenAI meldet Rückfall und gibt die Leitung frei", async () => {
  const t = setup({ fetch: (async () => ({ ok: false, json: async () => ({ error: { message: "x" } }) })) as never });
  const r = await startLiveCall({ slug: "muster", sdp: "v=0" }, t.deps);
  assert.equal(r.status, 502);
  assert.equal(r.body.fallback, true);
});
