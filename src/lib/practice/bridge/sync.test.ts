import assert from "node:assert/strict";
import { test } from "node:test";
import { PRESENTATION_HOST } from "../praxissoftware.ts";
import type {
  ConnectorAppointmentRequest,
  ConnectorAppointmentResult,
  ConnectorHours,
  ConnectorOwner,
  ConnectorPatient,
  ConnectorResource,
  ConnectorVet,
  PraxissoftwarePort,
  PraxissoftwareReadResult,
  PraxissoftwareWriteResult,
} from "../praxissoftware.ts";
import type { BridgeRepo, Counts, OutboxRow, Scope, SyncRun, SyncScope } from "./repo.ts";
import { syncEngine } from "./sync.ts";

const SCOPE: Scope = { practiceId: "prax-1", pmsKind: "vquadrat" };

// -- Fake BridgeRepo (plain object with Maps, kein DB-Zugriff) --------------

function fakeRepo() {
  const owners = new Map<string, ConnectorOwner>();
  const patients = new Map<string, ConnectorPatient>();
  const resources = new Map<string, ConnectorResource>();
  const vets = new Map<string, ConnectorVet>();
  const deleted = { resources: new Set<string>(), vets: new Set<string>() };
  let hours: ConnectorHours | null = null;
  const outbox = new Map<string, OutboxRow>();
  const runs: SyncRun[] = [];

  function upsertCounts<T extends { id: string }>(store: Map<string, T>, rows: T[]): Counts {
    const counts: Counts = { inserted: 0, updated: 0, unchanged: 0 };
    for (const row of rows) {
      if (store.has(row.id)) counts.updated += 1;
      else counts.inserted += 1;
      store.set(row.id, row);
    }
    return counts;
  }

  const repo: BridgeRepo = {
    async upsertOwners(_p, rows) {
      return upsertCounts(owners, rows);
    },
    async upsertPatients(_p, _ownerExternalId, rows) {
      return upsertCounts(patients, rows);
    },
    async upsertResources(_p, rows) {
      return upsertCounts(resources, rows);
    },
    async upsertVets(_p, rows) {
      return upsertCounts(vets, rows);
    },
    async saveHours(_p, h) {
      hours = h;
    },
    async softDeleteMissing(_p, entity, externalIds) {
      const store = entity === "resources" ? resources : vets;
      const removed = deleted[entity];
      let count = 0;
      for (const id of store.keys()) {
        if (!externalIds.includes(id) && !removed.has(id)) {
          removed.add(id);
          count += 1;
        }
      }
      return count;
    },
    async findOwners(_p, _q) {
      const all = [...owners.values()];
      if (all.length === 0) return { hit: false };
      return { hit: true, data: all, syncedAt: new Date() };
    },
    async patientsOf(_p, ownerExternalId) {
      const rows = [...patients.values()].filter((p) => p.ownerId === ownerExternalId);
      if (rows.length === 0) return { hit: false };
      return { hit: true, data: rows, syncedAt: new Date() };
    },
    async resources() {
      const rows = [...resources.values()];
      if (rows.length === 0) return { hit: false };
      return { hit: true, data: rows, syncedAt: new Date() };
    },
    async vets() {
      const rows = [...vets.values()];
      if (rows.length === 0) return { hit: false };
      return { hit: true, data: rows, syncedAt: new Date() };
    },
    async hours() {
      if (!hours) return { hit: false };
      return { hit: true, data: hours, syncedAt: new Date() };
    },
    async enqueue(p, item) {
      if (outbox.has(item.id)) return; // Idempotenz: zweiter Enqueue mit gleicher id ist ein No-Op.
      // Epoch statt `new Date()`: bleibt unabhängig von der realen Wanduhr sofort
      // fällig, wie es das echte Repository (`next_attempt_at = now()` beim Insert)
      // relativ zum jeweils folgenden Sync-Lauf auch ist.
      const now = new Date(0);
      outbox.set(item.id, {
        id: item.id,
        practiceId: p.practiceId,
        pmsKind: p.pmsKind,
        kind: item.kind,
        payload: item.payload as unknown as Record<string, unknown>,
        status: "pending",
        attempts: 0,
        nextAttemptAt: now,
        result: null,
        createdAt: now,
        updatedAt: now,
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
    async recordRun(run) {
      const idx = runs.findIndex((r) => r.id === run.id);
      if (idx >= 0) runs[idx] = run;
      else runs.push(run);
    },
    async lastRun(_p, scope: SyncScope) {
      const matching = runs.filter((r) => r.scope === scope);
      return matching.length ? matching[matching.length - 1]! : null;
    },
    async cleanup() {
      return { runs: 0, outbox: 0 };
    },
    async stats() {
      return { owners: 0, patients: 0, pendingOutbox: 0, processingOutbox: 0, failedOutbox: 0, lastMasterSyncAt: null };
    },
  };

  return { repo, owners, patients, resources, vets, deleted, outbox, runs };
}

// -- Fake PraxissoftwarePort (scripted responses) ----------------------------

type Scripted = {
  resources?: PraxissoftwareReadResult<ConnectorResource[]>;
  vets?: PraxissoftwareReadResult<ConnectorVet[]>;
  hours?: PraxissoftwareReadResult<ConnectorHours>;
  findOwners?: PraxissoftwareReadResult<ConnectorOwner[]>;
  patientsOf?: (ownerId: string) => PraxissoftwareReadResult<ConnectorPatient[]>;
  createAppointment?: (
    req: ConnectorAppointmentRequest,
  ) => PraxissoftwareWriteResult<ConnectorAppointmentResult>;
};

function fakeAdapter(script: Scripted = {}): PraxissoftwarePort {
  return {
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
      return script.findOwners ?? { ok: false, reason: "notConnected" };
    },
    async patientsOf(ownerId) {
      return script.patientsOf ? script.patientsOf(ownerId) : { ok: false, reason: "notConnected" };
    },
    async resources() {
      return script.resources ?? { ok: false, reason: "notConnected" };
    },
    async vets() {
      return script.vets ?? { ok: false, reason: "notConnected" };
    },
    async freeSlots() {
      return { ok: false, reason: "notConnected" };
    },
    async hours() {
      return script.hours ?? { ok: false, reason: "notConnected" };
    },
    async createAppointment(req) {
      return script.createAppointment
        ? script.createAppointment(req)
        : { ok: false, reason: "notConnected" };
    },
  };
}

function owner(id: string, overrides: Partial<ConnectorOwner> = {}): ConnectorOwner {
  return { id, name: "Vero Testner", phones: ["0664 1234567"], email: null, ...overrides };
}

function patient(id: string, ownerId: string, overrides: Partial<ConnectorPatient> = {}): ConnectorPatient {
  return {
    id,
    ownerId,
    name: "Rex",
    species: "Hund",
    breed: null,
    chip: null,
    birth: null,
    deceased: false,
    cave: false,
    caveText: null,
    permanentMed: null,
    ...overrides,
  };
}

function appointmentRequest(overrides: Partial<ConnectorAppointmentRequest> = {}): ConnectorAppointmentRequest {
  return {
    ownerId: "o1",
    patientId: "p1",
    resourceId: "r1",
    vetId: "v1",
    start: "2026-09-10T09:00:00.000Z",
    minutes: 20,
    ...overrides,
  };
}

test("syncMasterData zieht resources/vets/hours in die Bridge und schreibt einen Run", async () => {
  const { repo, resources, vets } = fakeRepo();
  const adapter = fakeAdapter({
    resources: { ok: true, data: [{ id: "r1", name: "Zimmer 1" }] },
    vets: { ok: true, data: [{ id: "v1", name: "Dr. Kuhn" }] },
    hours: { ok: true, data: { opening: [], closedDays: [] } },
  });
  const engine = syncEngine({ repo, adapter, scope: SCOPE, now: () => new Date("2026-09-08T10:00:00.000Z") });

  const run = await engine.syncMasterData();

  assert.equal(run.ok, true);
  assert.equal(run.scope, "master");
  assert.equal(run.practiceId, SCOPE.practiceId);
  assert.deepEqual(run.stats.resources, { inserted: 1, updated: 0, unchanged: 0, deleted: 0 });
  assert.deepEqual(run.stats.vets, { inserted: 1, updated: 0, unchanged: 0, deleted: 0 });
  assert.deepEqual(run.stats.hours, { ok: true });
  assert.equal(resources.size, 1);
  assert.equal(vets.size, 1);
  assert.ok(run.startedAt instanceof Date);
  assert.ok(run.finishedAt instanceof Date);
});

test("vollständiger Master-Sync markiert fehlende Ressourcen und Vets weich gelöscht", async () => {
  const first = fakeRepo();
  const seed = syncEngine({ repo: first.repo, adapter: fakeAdapter({
    resources: { ok: true, data: [{ id: "r1", name: "Zimmer 1" }, { id: "r2", name: "Zimmer 2" }] },
    vets: { ok: true, data: [{ id: "v1", name: "Dr. Kuhn" }] },
    hours: { ok: true, data: { opening: [], closedDays: [] } },
  }), scope: SCOPE });
  await seed.syncMasterData();
  const next = syncEngine({ repo: first.repo, adapter: fakeAdapter({
    resources: { ok: true, data: [{ id: "r1", name: "Zimmer 1" }] },
    vets: { ok: true, data: [] },
    hours: { ok: true, data: { opening: [], closedDays: [] } },
  }), scope: SCOPE });
  const run = await next.syncMasterData();
  assert.equal(run.ok, true);
  assert.deepEqual([...first.deleted.resources], ["r2"]);
  assert.deepEqual([...first.deleted.vets], ["v1"]);
});

test("leere erfolgreiche Connector-Antwort markiert den alten Cache vollständig weich gelöscht", async () => {
  const state = fakeRepo();
  const engine = syncEngine({ repo: state.repo, adapter: fakeAdapter({
    resources: { ok: true, data: [] }, vets: { ok: true, data: [] },
    hours: { ok: true, data: { opening: [], closedDays: [] } },
  }), scope: SCOPE });
  await state.repo.upsertResources(SCOPE, [{ id: "r1", name: "Alt" }]);
  await state.repo.upsertVets(SCOPE, [{ id: "v1", name: "Alt" }]);
  const run = await engine.syncMasterData();
  assert.equal(run.ok, true);
  assert.deepEqual([...state.deleted.resources], ["r1"]);
  assert.deepEqual([...state.deleted.vets], ["v1"]);
});

test("Master-Sync mit Teilfehler meldet ok:false, behält aber erfolgreiche Teilstände", async () => {
  const state = fakeRepo();
  const engine = syncEngine({ repo: state.repo, adapter: fakeAdapter({
    resources: { ok: true, data: [{ id: "r1", name: "Neu" }] },
    vets: { ok: false, reason: "error" }, hours: { ok: true, data: { opening: [], closedDays: [] } },
  }), scope: SCOPE });
  const run = await engine.syncMasterData();
  assert.equal(run.ok, false);
  assert.equal(state.resources.has("r1"), true);
  assert.match(run.error ?? "", /Interner Bridge-Fehler/);
});

test("Sync-Fehlertexte enthalten niemals Adapter-/DB-Nutzdaten", async () => {
  const { repo, runs } = fakeRepo();
  const adapter = fakeAdapter();
  adapter.resources = async () => {
    throw new Error("Halter Testner 066412345 test@example.com");
  };
  const logs: string[] = [];
  const engine = syncEngine({ repo, adapter, scope: SCOPE, log: (message) => logs.push(message) });

  const run = await engine.syncMasterData();

  assert.equal(run.ok, false);
  assert.equal(run.error, "Interner Bridge-Fehler");
  assert.ok(logs.every((line) => !/Testner|066412345|test@example\.com/.test(line)));
  assert.ok(runs.every((stored) => !/Testner|066412345|test@example\.com/.test(stored.error ?? "")));
});

test("syncOwnerByPhone fuegt Halter und deren Patienten in die Bridge ein", async () => {
  const { repo, owners, patients } = fakeRepo();
  const adapter = fakeAdapter({
    findOwners: { ok: true, data: [owner("o1")] },
    patientsOf: (ownerId) =>
      ownerId === "o1" ? { ok: true, data: [patient("p1", "o1")] } : { ok: false, reason: "notConnected" },
  });
  const engine = syncEngine({ repo, adapter, scope: SCOPE });

  const run = await engine.syncOwnerByPhone("0664 1234567");

  assert.equal(run.ok, true);
  assert.equal(run.scope, "owner");
  assert.deepEqual(run.stats.owners, { inserted: 1, updated: 0, unchanged: 0 });
  assert.equal(owners.size, 1);
  assert.equal(patients.size, 1);
});

test("syncOwnerByName mit notConnected-Adapter liefert ok:false ohne zu werfen", async () => {
  const { repo } = fakeRepo();
  const adapter = fakeAdapter({ findOwners: { ok: false, reason: "notConnected" } });
  const engine = syncEngine({ repo, adapter, scope: SCOPE });

  const run = await engine.syncOwnerByName("Testner");

  assert.equal(run.ok, false);
  assert.ok(run.error);
  assert.ok(!/Testner/.test(run.error ?? "")); // keine PII im Fehlertext
});

test("flushOutbox: ok -> sent", async () => {
  const { repo, outbox } = fakeRepo();
  await repo.enqueue(SCOPE, { id: "ob1", kind: "appointment", payload: appointmentRequest() });
  const adapter = fakeAdapter({
    createAppointment: () => ({ ok: true, data: { id: "appt-1", start: "2026-09-10T09:00:00.000Z", end: "2026-09-10T09:20:00.000Z" } }),
  });
  const engine = syncEngine({ repo, adapter, scope: SCOPE, now: () => new Date("2026-09-08T10:00:00.000Z") });

  const run = await engine.flushOutbox();

  assert.equal(run.ok, true);
  assert.equal(outbox.get("ob1")?.status, "sent");
  assert.deepEqual(outbox.get("ob1")?.result, { id: "appt-1", start: "2026-09-10T09:00:00.000Z", end: "2026-09-10T09:20:00.000Z" });
});

test("flushOutbox: conflict wird Endstatus ohne Wiederholung", async () => {
  const { repo, outbox } = fakeRepo();
  await repo.enqueue(SCOPE, { id: "ob-conflict", kind: "appointment", payload: appointmentRequest() });
  const adapter = fakeAdapter({ createAppointment: () => ({ ok: false, reason: "conflict" }) });
  const engine = syncEngine({ repo, adapter, scope: SCOPE });

  await engine.flushOutbox();

  const row = outbox.get("ob-conflict");
  assert.equal(row?.status, "conflict");
  assert.equal(row?.attempts, 0);
});

test("flushOutbox: error erhoeht attempts und setzt Backoff (min(2^attempts, 60) Minuten)", async () => {
  const { repo, outbox } = fakeRepo();
  await repo.enqueue(SCOPE, { id: "ob-error", kind: "appointment", payload: appointmentRequest() });
  const adapter = fakeAdapter({ createAppointment: () => ({ ok: false, reason: "error" }) });
  const start = new Date("2026-09-08T10:00:00.000Z");
  const engine = syncEngine({ repo, adapter, scope: SCOPE, now: () => start });

  await engine.flushOutbox(start);

  const row = outbox.get("ob-error");
  assert.equal(row?.status, "pending");
  assert.equal(row?.attempts, 1);
  assert.equal(row?.nextAttemptAt.getTime(), start.getTime() + 2 * 60_000); // 2^1 = 2 Minuten
});

test("flushOutbox: nach 8 Versuchen wird der Eintrag failed", async () => {
  const { repo, outbox } = fakeRepo();
  await repo.enqueue(SCOPE, { id: "ob-fail", kind: "appointment", payload: appointmentRequest() });
  const adapter = fakeAdapter({ createAppointment: () => ({ ok: false, reason: "error" }) });

  let clock = new Date("2026-09-08T10:00:00.000Z");
  const engine = syncEngine({ repo, adapter, scope: SCOPE, now: () => clock });

  for (let i = 0; i < 8; i += 1) {
    await engine.flushOutbox(clock);
    const row = outbox.get("ob-fail")!;
    if (row.status === "pending") {
      clock = new Date(row.nextAttemptAt.getTime()); // beim naechsten Versuch faellig
    }
  }

  const row = outbox.get("ob-fail");
  assert.equal(row?.status, "failed");
  assert.equal(row?.attempts, 8);
});

test("flushOutboxItem versucht genau einen Eintrag", async () => {
  const { repo, outbox } = fakeRepo();
  await repo.enqueue(SCOPE, { id: "ob-a", kind: "appointment", payload: appointmentRequest() });
  await repo.enqueue(SCOPE, { id: "ob-b", kind: "appointment", payload: appointmentRequest({ ownerId: "o2" }) });
  const calls: string[] = [];
  const adapter = fakeAdapter({
    createAppointment: (req) => {
      calls.push(req.ownerId);
      return { ok: true, data: { id: "appt-x", start: req.start, end: req.start } };
    },
  });
  const engine = syncEngine({ repo, adapter, scope: SCOPE });

  const run = await engine.flushOutboxItem("ob-a");

  assert.equal(run.ok, true);
  assert.deepEqual(calls, ["o1"]);
  assert.equal(outbox.get("ob-a")?.status, "sent");
  assert.equal(outbox.get("ob-b")?.status, "pending");
});

test("enqueue ist idempotent: gleiche id fuehrt nicht zu doppeltem Outbox-Eintrag", async () => {
  const { repo, outbox } = fakeRepo();
  await repo.enqueue(SCOPE, { id: "ob-dup", kind: "appointment", payload: appointmentRequest() });
  await repo.enqueue(SCOPE, { id: "ob-dup", kind: "appointment", payload: appointmentRequest({ minutes: 99 }) });

  assert.equal(outbox.size, 1);
  assert.equal((outbox.get("ob-dup")?.payload as ConnectorAppointmentRequest).minutes, 20);
});

test("recordRun wirft: Lauf wirft nicht, meldet ok:false", async () => {
  const { repo } = fakeRepo();
  repo.recordRun = async () => {
    throw new Error("fk kaputt");
  };
  const adapter = fakeAdapter({
    resources: { ok: true, data: [{ id: "r1", name: "Raum 1" }] },
    vets: { ok: true, data: [] },
    hours: { ok: true, data: { opening: [] } as never },
  });
  const engine = syncEngine({ repo, adapter, scope: SCOPE });
  const run = await engine.syncMasterData();
  assert.equal(run.ok, false);
  assert.match(run.error ?? "", /Protokoll/);
});

test("flushOutbox: atomisches Claim verhindert Doppelverarbeitung paralleler Läufe", async () => {
  const { repo, outbox } = fakeRepo();
  await repo.enqueue(SCOPE, { id: "parallel", kind: "appointment", payload: appointmentRequest() });
  let claims = 0;
  repo.claimOutbox = async (_scope, _now, limit, onlyId) => {
    const rows = [...outbox.values()].filter((r) => r.status === "pending" && (!onlyId || r.id === onlyId)).slice(0, limit);
    for (const row of rows) { outbox.set(row.id, { ...row, status: "processing" }); }
    claims += rows.length;
    return rows;
  };
  let sends = 0;
  const adapter = fakeAdapter({ createAppointment: () => { sends += 1; return { ok: true, data: { id: "a", start: "2026-09-14T10:00:00.000Z", end: "2026-09-14T10:20:00.000Z" } }; } });
  const a = syncEngine({ repo, adapter, scope: SCOPE });
  const b = syncEngine({ repo, adapter, scope: SCOPE });
  await Promise.all([a.flushOutbox(), b.flushOutbox()]);
  assert.equal(claims, 1);
  assert.equal(sends, 1);
});

test("flushOutbox protokolliert keinen Versand, wenn die Reservierung verloren ging", async () => {
  const { repo } = fakeRepo();
  await repo.enqueue(SCOPE, { id: "ob-lost", kind: "appointment", payload: appointmentRequest() });
  // Ein anderer Prozess hat die Reservierung uebernommen: das Speichern wird
  // abgelehnt. Der Lauf darf trotzdem nicht „gesendet“ melden.
  repo.markOutbox = async () => false;
  const adapter = fakeAdapter({
    createAppointment: () => ({ ok: true, data: { id: "appt-x", start: "2026-09-10T09:00:00.000Z", end: "2026-09-10T09:20:00.000Z" } }),
  });
  const engine = syncEngine({ repo, adapter, scope: SCOPE });

  const run = await engine.flushOutbox();

  const items = (run.stats as { outbox: Array<{ id: string; status: string }> }).outbox;
  assert.equal(items[0]?.status, "superseded", "Ein abgelehntes Speichern darf nicht als Versand gelten");
  assert.equal(items[0]?.id, "ob-lost");
});

test("flushOutbox meldet keinen Konflikt, wenn die Reservierung verloren ging", async () => {
  const { repo, outbox } = fakeRepo();
  await repo.enqueue(SCOPE, { id: "ob-lost-2", kind: "appointment", payload: appointmentRequest() });
  repo.markOutbox = async () => false;
  const adapter = fakeAdapter({ createAppointment: () => ({ ok: false, reason: "conflict" }) });
  const engine = syncEngine({ repo, adapter, scope: SCOPE });

  const run = await engine.flushOutbox();

  const items = (run.stats as { outbox: Array<{ status: string }> }).outbox;
  assert.equal(items[0]?.status, "superseded");
  // Die Zeile bleibt unangetastet — sie gehoert dem neueren Lauf.
  assert.notEqual(outbox.get("ob-lost-2")?.status, "conflict");
});

test("ein Datenbankfehler im Fehlerpfad bricht die Buchungsrunde nicht ab", async () => {
  const { repo, outbox } = fakeRepo();
  await repo.enqueue(SCOPE, { id: "ob-a", kind: "appointment", payload: appointmentRequest() });
  await repo.enqueue(SCOPE, { id: "ob-b", kind: "appointment", payload: appointmentRequest() });

  // Der Adapter wirft beim ersten Eintrag.
  let calls = 0;
  const adapter = fakeAdapter({
    createAppointment: () => {
      calls += 1;
      if (calls === 1) throw new Error("Adapterfehler");
      return { ok: true, data: { id: "appt-b", start: "2026-09-10T09:00:00.000Z", end: "2026-09-10T09:20:00.000Z" } };
    },
  });

  // Und das Speichern des Fehlerstatus scheitert zusaetzlich.
  const original = repo.markOutbox.bind(repo);
  repo.markOutbox = async (p, id, patch, owner) => {
    if (id === "ob-a") throw new Error("Datenbank nicht erreichbar");
    return original(p, id, patch, owner);
  };

  const engine = syncEngine({ repo, adapter, scope: SCOPE });
  const run = await engine.flushOutbox();

  // Die Runde laeuft weiter: der zweite Eintrag wird versendet.
  assert.equal(outbox.get("ob-b")?.status, "sent", "Der zweite Eintrag muss trotz Datenbankfehler versendet werden");
  assert.equal(calls, 2, "Beide Eintraege werden versucht");
  assert.equal(run.ok, true);
});

test("ein fehlgeschlagener Patienten-Teilabruf gilt nicht als voller Erfolg", async () => {
  const { repo, owners, patients } = fakeRepo();
  const adapter = fakeAdapter({
    findOwners: { ok: true, data: [owner("o1"), owner("o2")] },
    patientsOf: (ownerId) =>
      ownerId === "o1"
        ? { ok: true, data: [patient("p1", "o1")] }
        : { ok: false, reason: "notConnected" },
  });
  const engine = syncEngine({ repo, adapter, scope: SCOPE });

  const run = await engine.syncOwnerByPhone("0664 1234567");

  // Frueher stand der Lauf als voller Erfolg da, obwohl die Patienten des
  // zweiten Halters fehlten.
  assert.equal(run.ok, false, "Teilausfall ist kein voller Erfolg");
  // Der Fehlertext ist bewusst neutral (keine PII); die Kennzahl steht in den
  // Zählwerten des Laufs.
  assert.equal(run.error, "Interner Bridge-Fehler");
  assert.equal(run.stats.patientsPartial, 1);
  // Der erfolgreiche Teil bleibt erhalten.
  assert.equal(owners.size, 2);
  assert.equal(patients.size, 1);
});

test("flushOutbox erneuert die Reservierung vor jeder Uebertragung", async () => {
  const { repo, outbox } = fakeRepo();
  await repo.enqueue(SCOPE, { id: "ob-r1", kind: "appointment", payload: appointmentRequest() });
  await repo.enqueue(SCOPE, { id: "ob-r2", kind: "appointment", payload: appointmentRequest() });
  const renewals: string[] = [];
  repo.renewOutboxLease = async (_scope, id) => {
    renewals.push(id);
    return true;
  };
  const adapter = fakeAdapter({
    createAppointment: () => ({ ok: true, data: { id: "a", start: "2026-09-10T09:00:00.000Z", end: "2026-09-10T09:20:00.000Z" } }),
  });
  const engine = syncEngine({ repo, adapter, scope: SCOPE });

  await engine.flushOutbox();

  assert.equal(renewals.length, 2, "je Eintrag eine Erneuerung");
  assert.equal(outbox.get("ob-r1")?.status, "sent");
  assert.equal(outbox.get("ob-r2")?.status, "sent");
});

test("flushOutbox uebertraegt nicht, wenn die Reservierung nicht mehr gilt", async () => {
  const { repo, outbox } = fakeRepo();
  await repo.enqueue(SCOPE, { id: "ob-renew-lost", kind: "appointment", payload: appointmentRequest() });
  // Die Reservierung gehoert inzwischen einem anderen Prozess.
  repo.renewOutboxLease = async () => false;
  let sends = 0;
  const adapter = fakeAdapter({
    createAppointment: () => {
      sends += 1;
      return { ok: true, data: { id: "a", start: "2026-09-10T09:00:00.000Z", end: "2026-09-10T09:20:00.000Z" } };
    },
  });
  const engine = syncEngine({ repo, adapter, scope: SCOPE });

  const run = await engine.flushOutbox();

  assert.equal(sends, 0, "ohne gueltige Reservierung wird nicht gebucht");
  const items = (run.stats as { outbox: Array<{ id: string; status: string }> }).outbox;
  assert.equal(items[0]?.status, "superseded");
  // Die Zeile bleibt unangetastet — sie gehoert dem anderen Prozess.
  assert.notEqual(outbox.get("ob-renew-lost")?.status, "sent");
});

test("ein Datenbankfehler beim Erneuern bricht die Runde nicht ab", async () => {
  const { repo } = fakeRepo();
  await repo.enqueue(SCOPE, { id: "ob-x", kind: "appointment", payload: appointmentRequest() });
  await repo.enqueue(SCOPE, { id: "ob-y", kind: "appointment", payload: appointmentRequest() });
  let calls = 0;
  repo.renewOutboxLease = async () => {
    calls += 1;
    if (calls === 1) throw new Error("Datenbank nicht erreichbar");
    return true;
  };
  const adapter = fakeAdapter({
    createAppointment: () => ({ ok: true, data: { id: "a", start: "2026-09-10T09:00:00.000Z", end: "2026-09-10T09:20:00.000Z" } }),
  });
  const engine = syncEngine({ repo, adapter, scope: SCOPE });

  const run = await engine.flushOutbox();

  // Der erste Eintrag wird uebersprungen, der zweite laeuft weiter.
  const items = (run.stats as { outbox: Array<{ status: string }> }).outbox;
  assert.equal(items[0]?.status, "superseded");
  assert.equal(items[1]?.status, "sent");
  assert.equal(run.ok, true);
});
