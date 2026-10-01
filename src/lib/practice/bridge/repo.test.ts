import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { bridgeRepo, type BridgeRepo } from "./repo.ts";
import type {
  ConnectorAppointmentRequest,
  ConnectorHours,
  ConnectorOwner,
  ConnectorPatient,
  ConnectorResource,
  ConnectorVet,
} from "../praxissoftware.ts";

// Läuft gegen ein echtes PGLite im Speicher — kein Netz, keine Datei.
// `db.ts`s eigener Migrations-Pfad nutzt Vites `import.meta.glob`, das unter
// dem tsx-Testrunner (siehe scripts/run-tests.mjs) nicht verfügbar ist; darum
// wendet dieser Helfer `migrations/*.sql` selbst an (gleiches Prinzip wie
// `scripts/migrate.mjs`), unabhängig von db.ts.
async function memoryDb(): Promise<{ sql: Sql; pg: PGlite }> {
  const pg = new PGlite();
  await pg.waitReady;
  const dir = join(process.cwd(), "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const text = await readFile(join(dir, file), "utf8");
    // Multi-Statement-Datei in einem Rutsch anwenden (PGLite-API, kein Shell-Aufruf).
    await pg["exec"](text);
  }
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    const res = await pg.query(text, values);
    return res.rows;
  }) as unknown as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => {
    const res = await pg.query<T>(text, params);
    return res.rows;
  };
  return { sql, pg };
}

const SCOPE = { practiceId: "prax-1", pmsKind: "vquadrat" };

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

describe("bridgeRepo", () => {
  let sql: Sql;
  let pg: PGlite;
  let repo: BridgeRepo;

  before(async () => {
    ({ sql, pg } = await memoryDb());
    await sql.query(
      `insert into practices (id, name, owner_name, email) values ($1, $2, $3, $4)`,
      [SCOPE.practiceId, "Testordination", "Vero", "vero@example.invalid"],
    );
    repo = bridgeRepo(sql);
  });

  after(async () => {
    await pg.close();
  });

  it("upsertOwners: inserts, then reports unchanged, then updated on a real change", async () => {
    const first = await repo.upsertOwners(SCOPE, [owner("o1")]);
    assert.deepEqual(first, { inserted: 1, updated: 0, unchanged: 0 });

    const same = await repo.upsertOwners(SCOPE, [owner("o1")]);
    assert.deepEqual(same, { inserted: 0, updated: 0, unchanged: 1 });

    const changed = await repo.upsertOwners(SCOPE, [owner("o1", { name: "Vero Neu" })]);
    assert.deepEqual(changed, { inserted: 0, updated: 1, unchanged: 0 });
  });

  it("softDeleteMissing: leeres vollständiges Ergebnis markiert den alten Ressourcen-Cache weich gelöscht", async () => {
    await repo.upsertResources(SCOPE, [{ id: "empty-sync-resource", name: "Nur Test" }]);

    const deleted = await repo.softDeleteMissing(SCOPE, "resources", [], new Date("2026-09-14T12:00:00Z"));

    assert.equal(deleted, 1);
    const visible = await repo.resources(SCOPE);
    assert.deepEqual(visible, { hit: false });
    const rows = await sql.query<{ deleted_at: string | null }>(
      "select deleted_at from pms_resources where practice_id = $1 and pms_kind = $2 and external_id = $3",
      [SCOPE.practiceId, SCOPE.pmsKind, "empty-sync-resource"],
    );
    assert.equal(rows.length, 1);
    assert.ok(rows[0].deleted_at);
  });

  it("stats zählt failed/conflict, cleanup löscht nur Zugestelltes", async () => {
    const old = new Date("2020-01-01T00:00:00Z");
    const REQ = { ownerId: "o1", patientId: "p1", resourceId: "r1", vetId: "", start: "2026-09-09T08:00:00", minutes: 20 };
    await repo.recordRun({ id: "run-alt", practiceId: SCOPE.practiceId, pmsKind: SCOPE.pmsKind, scope: "master", startedAt: old, finishedAt: old, ok: true, stats: {}, error: null });
    await repo.enqueue(SCOPE, { id: "ob-sent", kind: "appointment", payload: REQ });
    await repo.markOutbox(SCOPE, "ob-sent", { status: "sent", updatedAt: old });
    await repo.enqueue(SCOPE, { id: "ob-failed", kind: "appointment", payload: REQ });
    await repo.markOutbox(SCOPE, "ob-failed", { status: "failed", updatedAt: old });
    await repo.enqueue(SCOPE, { id: "ob-conflict", kind: "appointment", payload: REQ });
    await repo.markOutbox(SCOPE, "ob-conflict", { status: "conflict", updatedAt: old });
    const before = await repo.stats(SCOPE);
    // `failed` UND `conflict` brauchen einen Menschen — beide zaehlen.
    assert.equal(before.failedOutbox, 2);
    const removed = await repo.cleanup(SCOPE, new Date("2021-01-01T00:00:00Z"));
    assert.equal(removed.runs, 1);
    // Nur der zugestellte Eintrag ist abgeschlossen.
    assert.equal(removed.outbox, 1);
    assert.equal((await repo.getOutbox(SCOPE, "ob-failed"))?.status, "failed");
    // Ein ungepruefter Konflikt darf NICHT verschwinden.
    assert.equal((await repo.getOutbox(SCOPE, "ob-conflict"))?.status, "conflict");
    assert.equal(await repo.getOutbox(SCOPE, "ob-sent"), null);
  });

  it("findOwners trifft auch die Zweitnummer einer Halterin", async () => {
    await repo.upsertOwners(SCOPE, [owner("o9", { phones: ["01 5551234", "0676 7778899"] })]);
    const second = await repo.findOwners(SCOPE, { phone: "+43 676 7778899" });
    assert.equal(second.hit, true);
    const first = await repo.findOwners(SCOPE, { phone: "015551234" });
    assert.equal(first.hit, true);
    const wrong = await repo.findOwners(SCOPE, { phone: "0676 7778890" });
    assert.equal(wrong.hit, false);
  });

  it("findOwners by phone suffix", async () => {
    await repo.upsertOwners(SCOPE, [owner("o2", { phones: ["+43 660 9998888"] })]);
    const hit = await repo.findOwners(SCOPE, { phone: "0660 9998888" });
    assert.equal(hit.hit, true);
    if (hit.hit) {
      assert.equal(hit.data.length, 1);
      assert.equal(hit.data[0]?.id, "o2");
      assert.ok(hit.syncedAt instanceof Date);
    }
  });

  it("findOwners by name (ilike)", async () => {
    await repo.upsertOwners(SCOPE, [owner("o3", { name: "Anna Beispiel" })]);
    const hit = await repo.findOwners(SCOPE, { name: "beispiel" });
    assert.equal(hit.hit, true);
    if (hit.hit) assert.ok(hit.data.some((o) => o.id === "o3"));
  });

  it("findOwners: no match => hit:false", async () => {
    const hit = await repo.findOwners(SCOPE, { phone: "0000000000" });
    assert.deepEqual(hit, { hit: false });
  });

  it("patientsOf: upsert then read back the same wire object via raw", async () => {
    await repo.upsertOwners(SCOPE, [owner("o4")]);
    const counts = await repo.upsertPatients(SCOPE, "o4", [patient("p1", "o4")]);
    assert.deepEqual(counts, { inserted: 1, updated: 0, unchanged: 0 });

    const hit = await repo.patientsOf(SCOPE, "o4");
    assert.equal(hit.hit, true);
    if (hit.hit) {
      assert.equal(hit.data.length, 1);
      assert.deepEqual(hit.data[0], patient("p1", "o4"));
    }
  });

  it("resources and vets: upsert + read", async () => {
    const rows: ConnectorResource[] = [{ id: "r1", name: "OP 1" }];
    await repo.upsertResources(SCOPE, rows);
    const resHit = await repo.resources(SCOPE);
    assert.equal(resHit.hit, true);
    if (resHit.hit) assert.deepEqual(resHit.data, rows);

    const vets: ConnectorVet[] = [{ id: "v1", name: "Dr. Kuhn" }];
    await repo.upsertVets(SCOPE, vets);
    const vetHit = await repo.vets(SCOPE);
    assert.equal(vetHit.hit, true);
    if (vetHit.hit) assert.deepEqual(vetHit.data, vets);
  });

  it("hours: no data => hit:false, then roundtrips after save, unchanged on identical save", async () => {
    const miss = await repo.hours(SCOPE);
    assert.deepEqual(miss, { hit: false });

    const hours: ConnectorHours = {
      opening: [{ day: "Mo", start: "08:00", end: "18:00" }],
      closedDays: ["So"],
    };
    await repo.saveHours(SCOPE, hours);
    const hit = await repo.hours(SCOPE);
    assert.equal(hit.hit, true);
    if (hit.hit) assert.deepEqual(hit.data, hours);

    // Punkt 20: Identisches Speichern ist kein Schreibvorgang fuer die NUTZDATEN,
    // aber der Anschluss hat den Inhalt gerade BESTAETIGT. Der Zeitstempel wird
    // deshalb erneuert — sonst hielt die Bridge die Zeiten fuer veraltet und
    // fragte den Anschluss erneut. Vorher blieb er hier stehen.
    const before = hit.hit ? hit.syncedAt.getTime() : 0;
    await new Promise((r) => setTimeout(r, 5));
    await repo.saveHours(SCOPE, hours);
    const again = await repo.hours(SCOPE);
    assert.equal(again.hit, true);
    if (again.hit) {
      assert.ok(
        again.syncedAt.getTime() > before,
        "der Bestaetigungszeitpunkt wurde erneuert",
      );
      assert.deepEqual(again.data, hours, "die Zeiten selbst bleiben gleich");
    }
  });

  it("outbox: enqueue, dueOutbox picks up pending due items, markOutbox updates status", async () => {
    const request: ConnectorAppointmentRequest = {
      ownerId: "o1",
      patientId: "p1",
      resourceId: "r1",
      vetId: "v1",
      start: "2026-02-10T09:00:00Z",
      minutes: 20,
    };
    await repo.enqueue(SCOPE, { id: "job-1", kind: "appointment", payload: request });

    const due = await repo.dueOutbox(SCOPE, new Date(Date.now() + 1000), 10);
    assert.equal(due.length, 1);
    assert.equal(due[0]?.id, "job-1");
    assert.equal(due[0]?.status, "pending");
    assert.deepEqual(due[0]?.payload, request);

    await repo.markOutbox(SCOPE, "job-1", {
      status: "sent",
      result: { id: "appt-1", start: request.start, end: "2026-02-10T09:20:00Z" },
    });
    const doneRows = await sql.query<{ status: string }>("select status from pms_outbox where id = $1", ["job-1"]);
    assert.equal(doneRows[0]?.status, "sent");

    const stillDue = await repo.dueOutbox(SCOPE, new Date(Date.now() + 1000), 10);
    assert.equal(stillDue.length, 0);
  });

  it("outbox schützt Lesen und Ändern über den Scope", async () => {
    const foreign = { practiceId: "prax-foreign", pmsKind: "vquadrat" };
    await sql.query(`insert into practices (id, name, owner_name, email) values ($1, $2, $3, $4)`, [foreign.practiceId, "Fremd", "Fremd", "fremd@example.invalid"]);
    const request: ConnectorAppointmentRequest = { ownerId: "o-scope", patientId: "p-scope", resourceId: "r-scope", vetId: "", start: "2026-09-14T10:00:00Z", minutes: 20 };
    await repo.enqueue(SCOPE, { id: "scope-job", kind: "appointment", payload: request });
    assert.equal(await repo.getOutbox(foreign, "scope-job"), null);
    await repo.markOutbox(foreign, "scope-job", { status: "sent" });
    assert.equal((await repo.getOutbox(SCOPE, "scope-job"))?.status, "pending");
  });

  it("claimOutbox: atomar, zweite Runde leer und ID-Filter gezielt", async () => {
    const request: ConnectorAppointmentRequest = { ownerId: "claim-o", patientId: "claim-p", resourceId: "claim-r", vetId: "", start: "2026-09-14T10:00:00Z", minutes: 20 };
    await repo.enqueue(SCOPE, { id: "claim-a", kind: "appointment", payload: request });
    await repo.enqueue(SCOPE, { id: "claim-b", kind: "appointment", payload: request });
    const at = new Date(Date.now() + 60_000);
    const selected = await repo.claimOutbox!(SCOPE, at, 10, "claim-b");
    assert.deepEqual(selected.map((r) => r.id), ["claim-b"]);
    assert.equal((await repo.getOutbox(SCOPE, "claim-b"))?.status, "processing");
    assert.equal((await repo.getOutbox(SCOPE, "claim-a"))?.status, "pending");
    const second = await repo.claimOutbox!(SCOPE, at, 10);
    assert.ok(second.some((r) => r.id === "claim-a"));
    assert.ok(!second.some((r) => r.id === "claim-b"));
    const third = await repo.claimOutbox!(SCOPE, at, 10);
    assert.equal(third.length, 0);
  });

  it("renewOutboxLease: verlaengert nur die eigene Reservierung", async () => {
    const request: ConnectorAppointmentRequest = { ownerId: "renew-o", patientId: "renew-p", resourceId: "renew-r", vetId: "", start: "2026-09-14T10:00:00Z", minutes: 20 };
    await repo.enqueue(SCOPE, { id: "renew-a", kind: "appointment", payload: request });
    const at = new Date(Date.now() + 60_000);
    await repo.claimOutbox!(SCOPE, at, 10, "renew-a", "owner-1");

    // Der Besitzer verlaengert: gilt weiter und die Frist wandert nach vorn.
    const later = new Date(at.getTime() + 4 * 60_000);
    const leaseUntil = new Date(later.getTime() + 5 * 60_000);
    assert.equal(await repo.renewOutboxLease!(SCOPE, "renew-a", "owner-1", leaseUntil, later), true);
    const row = await repo.getOutbox(SCOPE, "renew-a");
    assert.equal(row?.status, "processing");
    assert.equal(new Date(row!.nextAttemptAt).getTime(), leaseUntil.getTime());

    // Ein fremder Besitzer darf die Reservierung nicht verlaengern.
    assert.equal(await repo.renewOutboxLease!(SCOPE, "renew-a", "owner-2", leaseUntil, later), false);

    // Nach dem Schreiben ist die Reservierung frei — dann gibt es nichts zu
    // verlaengern.
    assert.equal(await repo.markOutbox(SCOPE, "renew-a", { status: "sent" }, "owner-1"), true);
    assert.equal(await repo.renewOutboxLease!(SCOPE, "renew-a", "owner-1", leaseUntil, later), false);
  });

  it("eine abgelaufene Reservierung laeuft nicht mehr weiter", async () => {
    const request: ConnectorAppointmentRequest = { ownerId: "exp-o", patientId: "exp-p", resourceId: "exp-r", vetId: "", start: "2026-09-14T10:00:00Z", minutes: 20 };
    await repo.enqueue(SCOPE, { id: "exp-a", kind: "appointment", payload: request });
    // Nach Ablauf der Reservierung darf ein zweiter Prozess uebernehmen — das
    // ist genau der Fall, den die Erneuerung vor jeder Uebertragung verhindert.
    const t0 = new Date();
    await repo.claimOutbox!(SCOPE, t0, 10, "exp-a", "owner-1");
    const afterExpiry = new Date(t0.getTime() + 6 * 60_000);
    const takeover = await repo.claimOutbox!(SCOPE, afterExpiry, 10, "exp-a", "owner-2");
    assert.deepEqual(takeover.map((r) => r.id), ["exp-a"]);
    // Der alte Besitzer kann danach weder verlaengern noch schreiben.
    assert.equal(await repo.renewOutboxLease!(SCOPE, "exp-a", "owner-1", new Date(afterExpiry.getTime() + 300_000), afterExpiry), false);
    assert.equal(await repo.markOutbox(SCOPE, "exp-a", { status: "sent" }, "owner-1"), false);
  });

  it("enqueue is idempotent by id", async () => {
    const request: ConnectorAppointmentRequest = {
      ownerId: "o1",
      patientId: "p1",
      resourceId: "r1",
      vetId: "v1",
      start: "2026-02-11T09:00:00Z",
      minutes: 20,
    };
    await repo.enqueue(SCOPE, { id: "job-2", kind: "appointment", payload: request });
    await repo.enqueue(SCOPE, { id: "job-2", kind: "appointment", payload: request });
    const rows = await sql.query("select id from pms_outbox where id = $1", ["job-2"]);
    assert.equal(rows.length, 1);
  });

  it("recordRun + lastRun roundtrip, most recent wins", async () => {
    await repo.recordRun({
      id: "run-1",
      practiceId: SCOPE.practiceId,
      pmsKind: SCOPE.pmsKind,
      scope: "master",
      startedAt: new Date("2026-02-01T08:00:00Z"),
      finishedAt: new Date("2026-02-01T08:00:05Z"),
      ok: true,
      stats: { owners: 3 },
      error: null,
    });
    await repo.recordRun({
      id: "run-2",
      practiceId: SCOPE.practiceId,
      pmsKind: SCOPE.pmsKind,
      scope: "master",
      startedAt: new Date("2026-02-01T09:00:00Z"),
      finishedAt: new Date("2026-02-01T09:00:05Z"),
      ok: false,
      stats: {},
      error: "boom",
    });

    const last = await repo.lastRun(SCOPE, "master");
    assert.equal(last?.id, "run-2");
    assert.equal(last?.ok, false);
    assert.equal(last?.error, "boom");

    const none = await repo.lastRun(SCOPE, "owner");
    assert.equal(none, null);
  });

  it("soft-deleted rows are excluded from finds", async () => {
    await repo.upsertOwners(SCOPE, [owner("o5", { name: "Gelöscht Halter" })]);
    await sql.query("update pms_owners set deleted_at = now() where practice_id = $1 and external_id = $2", [
      SCOPE.practiceId,
      "o5",
    ]);
    const hit = await repo.findOwners(SCOPE, { name: "gelöscht" });
    assert.deepEqual(hit, { hit: false });
  });

  it("Punkt 16: ein wiederkehrender Datensatz wird reaktiviert", async () => {
    // Ein weich geloeschter Eintrag, der unveraendert wieder auftaucht, hat
    // denselben Inhalt wie vor dem Loeschen. Frueher uebersprang der Vergleich
    // ihn deshalb — er blieb unsichtbar.
    await repo.upsertOwners(SCOPE, [owner("back1", { name: "Wieder Da" })]);
    await sql.query(
      "update pms_owners set deleted_at = now() where practice_id = $1 and external_id = $2",
      [SCOPE.practiceId, "back1"],
    );
    assert.deepEqual(await repo.findOwners(SCOPE, { name: "wieder da" }), { hit: false });

    const again = await repo.upsertOwners(SCOPE, [owner("back1", { name: "Wieder Da" })]);
    assert.equal(again.updated, 1, "gilt als aktualisiert, nicht als unveraendert");
    const hit = await repo.findOwners(SCOPE, { name: "wieder da" });
    assert.equal(hit.hit, true, "der Eintrag ist wieder sichtbar");
  });

  it("Punkt 15: unveraenderte Daten gelten nach dem Abgleich als bestaetigt", async () => {
    await repo.upsertOwners(SCOPE, [owner("fresh1")]);
    // Alter Zeitstempel, Inhalt bleibt gleich.
    await sql.query(
      "update pms_owners set synced_at = $3 where practice_id = $1 and external_id = $2",
      [SCOPE.practiceId, "fresh1", new Date("2020-01-01T00:00:00Z")],
    );
    const counts = await repo.upsertOwners(SCOPE, [owner("fresh1")]);
    assert.equal(counts.unchanged, 1, "inhaltlich unveraendert");

    const rows = await sql.query<{ synced_at: Date }>(
      "select synced_at from pms_owners where practice_id = $1 and external_id = $2",
      [SCOPE.practiceId, "fresh1"],
    );
    assert.ok(
      new Date(rows[0]!.synced_at).getFullYear() > 2020,
      "der Bestaetigungszeitpunkt wurde erneuert",
    );
  });

  it("Punkt 17: eine Liste gilt nur als frisch, wenn ALLE Eintraege frisch sind", async () => {
    await repo.upsertOwners(SCOPE, [owner("mix1", { name: "Frisch Halter" }), owner("mix2", { name: "Alt Halter" })]);
    // Ein Eintrag bleibt alt.
    await sql.query(
      "update pms_owners set synced_at = $3 where practice_id = $1 and external_id = $2",
      [SCOPE.practiceId, "mix2", new Date("2020-01-01T00:00:00Z")],
    );
    const hit = await repo.findOwners(SCOPE, { name: "halter" });
    assert.equal(hit.hit, true);
    // Frueher machte der NEUESTE Eintrag die ganze Liste frisch.
    assert.equal(
      hit.hit ? new Date(hit.syncedAt).getFullYear() : 0,
      2020,
      "der aelteste Eintrag bestimmt das Alter",
    );
  });

  it("stats: counts owners/patients (excluding soft-deleted), pending outbox, and last master sync", async () => {
    const scope = { practiceId: "prax-stats", pmsKind: "vquadrat" };
    await sql.query(`insert into practices (id, name, owner_name, email) values ($1, $2, $3, $4)`, [
      scope.practiceId,
      "Statsordination",
      "Vero",
      "vero-stats@example.invalid",
    ]);
    await repo.upsertOwners(scope, [owner("so1"), owner("so2")]);
    await repo.upsertPatients(scope, "so1", [patient("sp1", "so1"), patient("sp2", "so1")]);
    await sql.query("update pms_owners set deleted_at = now() where practice_id = $1 and external_id = $2", [
      scope.practiceId,
      "so2",
    ]);

    const empty = await repo.stats(scope);
    assert.deepEqual(empty, { owners: 1, patients: 2, pendingOutbox: 0, processingOutbox: 0, failedOutbox: 0, lastMasterSyncAt: null });

    const request: ConnectorAppointmentRequest = {
      ownerId: "so1",
      patientId: "sp1",
      resourceId: "r1",
      vetId: "v1",
      start: "2026-02-01T09:00:00Z",
      minutes: 15,
    };
    await repo.enqueue(scope, {
      id: "stats-job-1",
      kind: "appointment",
      payload: request,
    });
    await repo.recordRun({
      id: "stats-run-1",
      practiceId: scope.practiceId,
      pmsKind: scope.pmsKind,
      scope: "master",
      startedAt: new Date("2026-02-01T08:00:00Z"),
      finishedAt: new Date("2026-02-01T08:00:05Z"),
      ok: true,
      stats: {},
      error: null,
    });

    const after = await repo.stats(scope);
    assert.equal(after.owners, 1);
    assert.equal(after.patients, 2);
    assert.equal(after.pendingOutbox, 1);
    assert.equal(after.lastMasterSyncAt?.toISOString(), new Date("2026-02-01T08:00:05Z").toISOString());
  });

  it("ein fehlgeschlagener Lauf zählt nicht als letzte Synchronisierung", async () => {
    const scope = { practiceId: "prax-stats-fail", pmsKind: "vquadrat" };
    await sql.query(`insert into practices (id, name, owner_name, email) values ($1, $2, $3, $4)`, [
      scope.practiceId,
      "Fehllauf-Ordination",
      "Vero",
      "vero-stats-fail@example.invalid",
    ]);
    // Ein erfolgreicher Lauf ...
    await repo.recordRun({
      id: "lauf-gut",
      practiceId: scope.practiceId,
      pmsKind: scope.pmsKind,
      scope: "master",
      startedAt: new Date("2026-02-01T08:00:00Z"),
      finishedAt: new Date("2026-02-01T08:00:05Z"),
      ok: true,
      stats: {},
      error: null,
    });
    // ... und danach ein fehlgeschlagener. Der darf die Zeit NICHT ersetzen.
    await repo.recordRun({
      id: "lauf-kaputt",
      practiceId: scope.practiceId,
      pmsKind: scope.pmsKind,
      scope: "master",
      startedAt: new Date("2026-02-01T09:00:00Z"),
      finishedAt: new Date("2026-02-01T09:00:03Z"),
      ok: false,
      stats: {},
      error: "Adapter nicht erreichbar",
    });

    const stats = await repo.stats(scope);
    assert.equal(
      stats.lastMasterSyncAt?.toISOString(),
      new Date("2026-02-01T08:00:05Z").toISOString(),
      "Der fehlgeschlagene Lauf darf den letzten erfolgreichen Stand nicht überschreiben",
    );
  });
});
