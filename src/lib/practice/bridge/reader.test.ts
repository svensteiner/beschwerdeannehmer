import assert from "node:assert/strict";
import { test } from "node:test";
import { PRESENTATION_HOST } from "../praxissoftware.ts";
import type {
  ConnectorAppointmentRequest,
  ConnectorAppointmentResult,
  ConnectorHours,
  ConnectorOwner,
  ConnectorResource,
  PraxissoftwarePort,
  PraxissoftwareWriteResult,
} from "../praxissoftware.ts";
import type { BridgeHit, BridgeRepo, OutboxRow, Scope } from "./repo.ts";
import { bridgeReader } from "./reader.ts";

const SCOPE: Scope = { practiceId: "prax-1", pmsKind: "vquadrat" };

// -- Fake BridgeRepo: gezielt steuerbare Treffer/Alter je Aufruf ------------

function fakeRepo(seed: {
  resources?: BridgeHit<ConnectorResource[]>;
  hours?: BridgeHit<ConnectorHours>;
  owners?: BridgeHit<ConnectorOwner[]>;
} = {}) {
  const calls: string[] = [];
  const upserted: Record<string, unknown[]> = { resources: [], owners: [] };
  const outbox = new Map<string, OutboxRow>();

  const repo: BridgeRepo = {
    async upsertOwners(_p, rows) {
      upserted.owners!.push(...rows);
      return { inserted: rows.length, updated: 0, unchanged: 0 };
    },
    async upsertPatients() {
      return { inserted: 0, updated: 0, unchanged: 0 };
    },
    async upsertResources(_p, rows) {
      calls.push("upsertResources");
      upserted.resources!.push(...rows);
      return { inserted: rows.length, updated: 0, unchanged: 0 };
    },
    async upsertVets() {
      return { inserted: 0, updated: 0, unchanged: 0 };
    },
    async saveHours() {
      calls.push("saveHours");
    },
    async softDeleteMissing() {
      return 0;
    },
    async findOwners() {
      calls.push("findOwners");
      return seed.owners ?? { hit: false };
    },
    async patientsOf() {
      return { hit: false };
    },
    async resources() {
      calls.push("resources");
      return seed.resources ?? { hit: false };
    },
    async vets() {
      return { hit: false };
    },
    async hours() {
      calls.push("hours");
      return seed.hours ?? { hit: false };
    },
    async enqueue(p, item) {
      outbox.set(item.id, {
        id: item.id,
        practiceId: p.practiceId,
        pmsKind: p.pmsKind,
        kind: item.kind,
        payload: item.payload as unknown as Record<string, unknown>,
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(0),
        result: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      });
    },
    async getOutbox(_p, id) {
      return outbox.get(id) ?? null;
    },
    async dueOutbox(_p, now, limit) {
      return [...outbox.values()]
        .filter((r) => r.status === "pending" && r.nextAttemptAt.getTime() <= now.getTime())
        .slice(0, limit);
    },
    async markOutbox(_p, id, patch) {
      const row = outbox.get(id);
      if (!row) return false;
      outbox.set(id, { ...row, ...patch, updatedAt: new Date() });
      return true;
    },
    async recordRun() {},
    async lastRun() {
      return null;
    },
    async cleanup() {
      return { runs: 0, outbox: 0 };
    },
    async stats() {
      return { owners: 0, patients: 0, pendingOutbox: 0, processingOutbox: 0, failedOutbox: 0, lastMasterSyncAt: null };
    },
  };

  return { repo, calls, upserted, outbox };
}

// -- Fake Adapter: scriptbare Antworten + Aufrufzähler -----------------------

function fakeAdapter(overrides: Partial<PraxissoftwarePort> = {}) {
  const calls: string[] = [];
  const base: PraxissoftwarePort = {
    kind: "vquadrat",
    label: "Vquadrat Veterinär",
    host: PRESENTATION_HOST,
    sendAkte: () => ({ ok: false, reason: "notConnected" }),
    sendSlot: () => ({ ok: false, reason: "notConnected" }),
    sendKontakt: () => ({ ok: false, reason: "notConnected" }),
    async health() {
      return { ok: false, reason: "notConnected" };
    },
    async capabilities() {
      return { ok: false, reason: "notConnected" };
    },
    async findOwners() {
      calls.push("findOwners");
      return { ok: false, reason: "notConnected" };
    },
    async patientsOf() {
      return { ok: false, reason: "notConnected" };
    },
    async resources() {
      calls.push("resources");
      return { ok: false, reason: "notConnected" };
    },
    async vets() {
      return { ok: false, reason: "notConnected" };
    },
    async freeSlots() {
      calls.push("freeSlots");
      return { ok: false, reason: "notConnected" };
    },
    async hours() {
      calls.push("hours");
      return { ok: false, reason: "notConnected" };
    },
    async createAppointment() {
      calls.push("createAppointment");
      return { ok: false, reason: "notConnected" };
    },
    ...overrides,
  };
  return { adapter: base, calls };
}

const RESOURCE: ConnectorResource = { id: "r1", name: "Zimmer 1" };
const HOURS: ConnectorHours = { opening: [{ day: "mo", start: "08:00", end: "18:00" }], closedDays: ["so"] };
const OWNER: ConnectorOwner = { id: "o1", name: "Vero Testner", phones: ["066412345"], email: null };

test("resources: frischer Bridge-Treffer -> kein Adapter-Aufruf", async () => {
  const { repo, upserted } = fakeRepo({ resources: { hit: true, data: [RESOURCE], syncedAt: new Date() } });
  const { adapter, calls: adapterCalls } = fakeAdapter();
  const port = bridgeReader({ repo, adapter, scope: SCOPE, now: () => new Date() });

  const res = await port.resources();
  assert.deepEqual(res, { ok: true, data: [RESOURCE] });
  assert.equal(adapterCalls.includes("resources"), false);
  assert.equal(upserted.resources!.length, 0);
});

test("resources: veralteter Bridge-Treffer -> Adapter gefragt, Ergebnis upgeserted", async () => {
  const staleAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h alt, Default maxAge 24h
  const { repo, upserted, calls: repoCalls } = fakeRepo({
    resources: { hit: true, data: [RESOURCE], syncedAt: staleAt },
  });
  const fresh: ConnectorResource = { id: "r2", name: "Zimmer 2" };
  let adapterCalled = false;
  const { adapter } = fakeAdapter({
    async resources() {
      adapterCalled = true;
      return { ok: true, data: [fresh] };
    },
  });
  const port = bridgeReader({ repo, adapter, scope: SCOPE });

  const res = await port.resources();
  assert.deepEqual(res, { ok: true, data: [fresh] });
  assert.equal(adapterCalled, true);
  assert.deepEqual(upserted.resources, [fresh]);
  assert.ok(repoCalls.includes("upsertResources"));
});

test("hours: Adapter-Fehler + veralteter Bridge-Treffer -> als Ersatz gekennzeichnet", async () => {
  // Zwei Tage alt: noch innerhalb des Hoechstalters, aber nicht mehr frisch.
  const staleAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const { repo } = fakeRepo({ hours: { hit: true, data: HOURS, syncedAt: staleAt } });
  const { adapter } = fakeAdapter({
    async hours() {
      return { ok: false, reason: "error" };
    },
  });
  const port = bridgeReader({ repo, adapter, scope: SCOPE });

  const res = await port.hours();
  // `stale` macht sichtbar, dass die Praxissoftware nicht erreichbar war.
  // Vorher war der Ersatz von frischen Daten nicht zu unterscheiden.
  assert.deepEqual(res, { ok: true, data: HOURS, stale: true });
});

test("hours: zu alter Ersatz gilt nicht mehr als verlaesslich", async () => {
  // 41 Tage alter Zwischenspeicher: bei so langem Ausfall duerfen die
  // Oeffnungszeiten nicht unbegrenzt weiterverwendet werden.
  const staleAt = new Date(Date.now() - 999 * 60 * 60 * 1000);
  const { repo } = fakeRepo({ hours: { hit: true, data: HOURS, syncedAt: staleAt } });
  const { adapter } = fakeAdapter({
    async hours() {
      return { ok: false, reason: "error" };
    },
  });
  const port = bridgeReader({ repo, adapter, scope: SCOPE });

  assert.deepEqual(await port.hours(), { ok: false, reason: "error" });
});

test("hours: Adapter-Fehler ohne Bridge-Daten -> Fehler durchgereicht", async () => {
  const { repo } = fakeRepo({});
  const { adapter } = fakeAdapter({
    async hours() {
      return { ok: false, reason: "timeout" };
    },
  });
  const port = bridgeReader({ repo, adapter, scope: SCOPE });

  const res = await port.hours();
  assert.deepEqual(res, { ok: false, reason: "timeout" });
});

test("findOwners: frischer Treffer innerhalb 1h -> kein Adapter-Aufruf", async () => {
  const { repo } = fakeRepo({ owners: { hit: true, data: [OWNER], syncedAt: new Date() } });
  const { adapter, calls } = fakeAdapter();
  const port = bridgeReader({ repo, adapter, scope: SCOPE });

  const res = await port.findOwners({ phone: "066412345" });
  assert.deepEqual(res, { ok: true, data: [OWNER] });
  assert.equal(calls.includes("findOwners"), false);
});

test("findOwners: 2h alter Treffer (>1h Default) -> Adapter gefragt", async () => {
  const staleAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const { repo, upserted } = fakeRepo({ owners: { hit: true, data: [OWNER], syncedAt: staleAt } });
  const fresh: ConnectorOwner = { id: "o2", name: "Neu Halterin", phones: [], email: null };
  const { adapter } = fakeAdapter({
    async findOwners() {
      return { ok: true, data: [fresh] };
    },
  });
  const port = bridgeReader({ repo, adapter, scope: SCOPE });

  const res = await port.findOwners({ name: "Neu" });
  assert.deepEqual(res, { ok: true, data: [fresh] });
  assert.deepEqual(upserted.owners, [fresh]);
});

test("freeSlots: nie gecacht, immer Adapter", async () => {
  const { repo } = fakeRepo({});
  const { adapter, calls } = fakeAdapter({
    async freeSlots() {
      calls.push("freeSlots");
      return { ok: true, data: [{ start: "2026-09-08T10:00:00Z", end: "2026-09-08T10:20:00Z" }] };
    },
  });
  const port = bridgeReader({ repo, adapter, scope: SCOPE });

  await port.freeSlots({ date: "2026-09-08", resourceId: "r1", minutes: 20 });
  await port.freeSlots({ date: "2026-09-08", resourceId: "r1", minutes: 20 });
  assert.equal(calls.filter((c) => c === "freeSlots").length, 2);
});

test("sendAkte/sendSlot/sendKontakt bleiben notConnected", async () => {
  const { repo } = fakeRepo({});
  const { adapter } = fakeAdapter();
  const port = bridgeReader({ repo, adapter, scope: SCOPE });

  assert.deepEqual(port.sendAkte({} as never), { ok: false, reason: "notConnected" });
  assert.deepEqual(port.sendSlot({} as never), { ok: false, reason: "notConnected" });
  assert.deepEqual(port.sendKontakt({} as never), { ok: false, reason: "notConnected" });
});

test("health/capabilities: reine Durchreichung an den Adapter", async () => {
  const { repo } = fakeRepo({});
  const { adapter } = fakeAdapter({
    async health() {
      return { ok: true, data: { ok: true, adapter: "vquadrat", readOnly: false, version: "1" } };
    },
  });
  const port = bridgeReader({ repo, adapter, scope: SCOPE });

  const res = await port.health();
  assert.equal(res.ok, true);
});

// -- createAppointment --------------------------------------------------------

const REQUEST: ConnectorAppointmentRequest = {
  ownerId: "o1",
  patientId: "p1",
  resourceId: "r1",
  vetId: "v1",
  start: "2026-09-08T10:00:00Z",
  minutes: 20,
  reason: "Kontrolle",
};

function appointmentAdapter(
  result: PraxissoftwareWriteResult<ConnectorAppointmentResult>,
): { adapter: PraxissoftwarePort; calls: string[] } {
  return fakeAdapter({
    async createAppointment() {
      return result;
    },
  });
}

test("createAppointment: sent -> ok:true mit Ergebnis", async () => {
  const { repo } = fakeRepo({});
  const { adapter } = appointmentAdapter({ ok: true, data: { id: "a1", start: REQUEST.start, end: "2026-09-08T10:20:00Z" } });
  const port = bridgeReader({ repo, adapter, scope: SCOPE });

  const res = await port.createAppointment(REQUEST);
  assert.deepEqual(res, { ok: true, data: { id: "a1", start: REQUEST.start, end: "2026-09-08T10:20:00Z" } });
});

test("createAppointment: conflict -> ok:false reason conflict", async () => {
  const { repo } = fakeRepo({});
  const { adapter } = appointmentAdapter({ ok: false, reason: "conflict" });
  const port = bridgeReader({ repo, adapter, scope: SCOPE });

  const res = await port.createAppointment(REQUEST);
  assert.deepEqual(res, { ok: false, reason: "conflict" });
});

test("createAppointment: forbidden -> ok:false reason forbidden", async () => {
  const { repo } = fakeRepo({});
  const { adapter } = appointmentAdapter({ ok: false, reason: "forbidden" });
  const port = bridgeReader({ repo, adapter, scope: SCOPE });

  const res = await port.createAppointment(REQUEST);
  assert.deepEqual(res, { ok: false, reason: "forbidden" });
});

test("createAppointment: error/notConnected -> ok:false reason error, bleibt pending", async () => {
  const { repo, outbox } = fakeRepo({});
  const { adapter } = appointmentAdapter({ ok: false, reason: "error" });
  const port = bridgeReader({ repo, adapter, scope: SCOPE });

  const res = await port.createAppointment(REQUEST);
  assert.deepEqual(res, { ok: false, reason: "error" });
  const row = [...outbox.values()][0]!;
  assert.equal(row.status, "pending");
});

test("createAppointment: gleiche Anfrage -> gleiche (deterministische) Outbox-ID", async () => {
  const { repo, outbox } = fakeRepo({});
  const { adapter } = appointmentAdapter({ ok: false, reason: "error" });
  const port = bridgeReader({ repo, adapter, scope: SCOPE });

  await port.createAppointment(REQUEST);
  await port.createAppointment(REQUEST);
  assert.equal(outbox.size, 1);
});

test("createAppointment: anderes Praxisprogramm -> eigene Outbox-ID", async () => {
  // Ohne pmsKind im Schluessel entstuende beim Programmwechsel dieselbe Kennung.
  // Der vorhandene Eintrag ist schon an das ALTE Programm gesendet,
  // `on conflict (id) do nothing` verwirft den neuen, und die Buchung erreicht
  // das neue Programm nie.
  const { repo, outbox } = fakeRepo({});
  const { adapter } = appointmentAdapter({ ok: false, reason: "error" });

  const erste = bridgeReader({ repo, adapter, scope: SCOPE });
  const zweite = bridgeReader({ repo, adapter, scope: { ...SCOPE, pmsKind: "anderes" } });
  await erste.createAppointment(REQUEST);
  await zweite.createAppointment(REQUEST);

  assert.equal(outbox.size, 2, "je Programm ein eigener Vorgang");
  assert.deepEqual(
    [...outbox.values()].map((row) => row.pmsKind).sort(),
    ["anderes", "vquadrat"],
  );
});

test("createAppointment: zwei Reader desselben Programms bleiben idempotent", async () => {
  // Die Ergaenzung darf die Idempotenz nicht aufheben.
  const { repo, outbox } = fakeRepo({});
  const { adapter } = appointmentAdapter({ ok: false, reason: "error" });
  const a = bridgeReader({ repo, adapter, scope: SCOPE });
  const b = bridgeReader({ repo, adapter, scope: { ...SCOPE } });

  await a.createAppointment(REQUEST);
  await b.createAppointment(REQUEST);

  assert.equal(outbox.size, 1);
});

test("findOwners ohne Suchkriterium fragt weder Bridge noch Adapter", async () => {
  // Eine leere Anfrage kann die Praxissoftware dazu bringen, ihren ganzen
  // Halterbestand zu liefern.
  const { repo, calls: repoCalls } = fakeRepo({});
  const { adapter, calls: adapterCalls } = fakeAdapter();
  const port = bridgeReader({ repo, adapter, scope: SCOPE });

  assert.deepEqual(await port.findOwners({}), { ok: false, reason: "error" });
  assert.deepEqual(await port.findOwners({ phone: "   ", name: "" }), { ok: false, reason: "error" });
  assert.equal(adapterCalls.includes("findOwners"), false, "kein Adapter-Aufruf");
  assert.equal(repoCalls.includes("findOwners"), false, "auch kein Bridge-Aufruf");

  // Mit Kriterium wird weiterhin gesucht.
  await port.findOwners({ name: "Testner" });
  assert.equal(adapterCalls.includes("findOwners"), true, "mit Kriterium wird gesucht");
});

test("Bridge-DB defekt: Lesen = Miss, Schreiben bleibt fail-closed", async () => {
  const { repo } = fakeRepo({});
  const boom = async () => {
    throw new Error("db kaputt");
  };
  repo.resources = boom as typeof repo.resources;
  repo.upsertResources = boom as typeof repo.upsertResources;
  repo.enqueue = boom as typeof repo.enqueue;
  const { adapter, calls } = fakeAdapter({
    async resources() {
      calls.push("resources");
      return { ok: true, data: [{ id: "r1", name: "Raum 1" }] };
    },
    async createAppointment() {
      calls.push("createAppointment");
      return { ok: true, data: { id: "77", start: "2026-09-08T10:00:00Z", end: "2026-09-08T10:20:00Z" } };
    },
  });
  const logs: string[] = [];
  const port = bridgeReader({ repo, adapter, scope: SCOPE, log: (m) => logs.push(m) });

  const res = await port.resources();
  assert.equal(res.ok, true);
  const booked = await port.createAppointment({
    ownerId: "o1",
    patientId: "p1",
    resourceId: "r1",
    vetId: "",
    start: "2026-09-08T10:00:00Z",
    minutes: 20,
  });
  assert.deepEqual(booked, { ok: false, reason: "error" });
  assert.equal(calls.filter((c) => c === "createAppointment").length, 0);
  assert.ok(logs.length >= 2);
  assert.ok(logs.every((l) => !l.includes("o1")));
});

test("Bridge-Fehlertexte enthalten niemals Adapter-/DB-Nutzdaten", async () => {
  const { repo } = fakeRepo({});
  repo.resources = async () => { throw new Error("Halter Testner 066412345 test@example.com"); };
  const logs: string[] = [];
  const port = bridgeReader({ repo, adapter: fakeAdapter().adapter, scope: SCOPE, log: (m) => logs.push(m) });

  await port.resources();
  assert.ok(logs.length > 0);
  assert.ok(logs.every((line) => !/Testner|066412345|test@example\.com/.test(line)));
});

test("BridgeReader: werfender Adapter liefert neutralen Fehler oder stale Fallback", async () => {
  const stale = { hit: true as const, data: [{ id: "cached", name: "Cache" }], syncedAt: new Date(0) };
  const { repo } = fakeRepo({ resources: stale });
  const adapter = fakeAdapter().adapter;
  adapter.resources = async () => { throw new Error("adapter intern"); };
  const port = bridgeReader({ repo, adapter, scope: SCOPE, now: () => new Date(2 * 24 * 60 * 60 * 1000), log: () => {} });
  const fallback = await port.resources();
  // Zwei Tage alt und der Adapter wirft: Ersatz, sichtbar gekennzeichnet.
  assert.deepEqual(fallback, { ok: true, data: stale.data, stale: true });

  const empty = fakeRepo({});
  const failingAdapter = fakeAdapter().adapter;
  failingAdapter.resources = async () => { throw new Error("adapter intern"); };
  const failClosed = await bridgeReader({ repo: empty.repo, adapter: failingAdapter, scope: SCOPE }).resources();
  assert.deepEqual(failClosed, { ok: false, reason: "error" });
});
