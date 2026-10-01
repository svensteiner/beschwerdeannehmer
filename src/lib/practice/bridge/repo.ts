/**
 * Bridge-Repository (AP 42, siehe docs/PLAN_PMS_Bridge.md Abschnitt 4.3).
 * Einziger DB-Zugriffspunkt für die `pms_*`-Tabellen. Upserts vergleichen den
 * `external_hash` gegen den vorhandenen Stand und schreiben nur, wenn er sich
 * geändert hat (No-Op-Schutz gegen unnötige Writes bei jedem Sync-Lauf).
 *
 * `raw` speichert das vollständige Connector-Wire-Objekt — die Read-Methoden
 * geben es unverändert zurück, damit Aufrufer exakt die gleiche Form wie vom
 * Live-Adapter bekommen (siehe Plan 4.5, BridgeReader implementiert denselben
 * `PraxissoftwarePort`).
 */

import type { Sql } from "@/lib/db";
import type {
  ConnectorAppointmentRequest,
  ConnectorHours,
  ConnectorOwner,
  ConnectorPatient,
  ConnectorResource,
  ConnectorVet,
} from "../praxissoftware.ts";
import { canonicalHash, escapeLikeNeedle, normalizePhone, OWNER_SEARCH_LIMIT, phoneSuffix, type BridgeHit, type Counts, type OutboxRow, type Scope, type SyncRun, type SyncScope } from "./schema.ts";

/**
 * Wie lange eine Reservierung gilt. `flushOutbox` verarbeitet die Einträge
 * nacheinander; vor jeder Übertragung wird die Frist über
 * `renewOutboxLease` erneuert, damit sie bei einer langen Runde nicht abläuft
 * (Migration 0027).
 */
export const OUTBOX_LEASE_MS = 5 * 60_000;

export type { Scope, BridgeHit, OutboxRow, SyncRun, SyncScope, Counts } from "./schema.ts";

export interface BridgeRepo {
  upsertOwners(p: Scope, rows: ConnectorOwner[]): Promise<Counts>;
  upsertPatients(p: Scope, ownerExternalId: string, rows: ConnectorPatient[]): Promise<Counts>;
  upsertResources(p: Scope, rows: ConnectorResource[]): Promise<Counts>;
  upsertVets(p: Scope, rows: ConnectorVet[]): Promise<Counts>;
  saveHours(p: Scope, hours: ConnectorHours): Promise<void>;
  /** Markiert aktive Datensätze, die ein vollständiger Pull nicht mehr liefert. */
  softDeleteMissing(p: Scope, entity: "resources" | "vets", externalIds: string[], at?: Date): Promise<number>;
  findOwners(p: Scope, q: { phone?: string; name?: string }): Promise<BridgeHit<ConnectorOwner[]>>;
  patientsOf(p: Scope, ownerExternalId: string): Promise<BridgeHit<ConnectorPatient[]>>;
  resources(p: Scope): Promise<BridgeHit<ConnectorResource[]>>;
  vets(p: Scope): Promise<BridgeHit<ConnectorVet[]>>;
  hours(p: Scope): Promise<BridgeHit<ConnectorHours>>;
  enqueue(p: Scope, item: { id: string; kind: "appointment"; payload: ConnectorAppointmentRequest }): Promise<void>;
  /** Einzeleintrag lesen (AP 44, BridgeReader liest das Ergebnis eines `flushOutboxItem` zurück). */
  getOutbox(p: Scope, id: string): Promise<OutboxRow | null>;
  dueOutbox(p: Scope, now: Date, limit: number): Promise<OutboxRow[]>;
  /**
   * Reserviert fällige Zeilen atomar, damit parallele Läufe denselben Eintrag
   * nicht doppelt senden. `owner` kennzeichnet den reservierenden Prozess;
   * nur er darf das Ergebnis später schreiben.
   */
  claimOutbox?(p: Scope, now: Date, limit: number, id?: string, owner?: string): Promise<OutboxRow[]>;
  /**
   * Verlängert die Reservierung eines Eintrags, den `owner` hält, und meldet,
   * ob er ihn noch hält. `false` heißt: ein anderer Prozess hat ihn
   * übernommen — dieser Lauf darf ihn nicht mehr übertragen.
   *
   * Nötig, weil `flushOutbox` alle fälligen Einträge gemeinsam reserviert und
   * sie danach nacheinander verarbeitet. Bei einer langen Runde lief die
   * Reservierung späterer Einträge vorher ab.
   */
  renewOutboxLease?(p: Scope, id: string, owner: string | undefined, leaseUntil: Date, now: Date): Promise<boolean>;
  /** Schreibt das Ergebnis; `false` bedeutet, die Reservierung lag woanders. */
  markOutbox(p: Scope, id: string, patch: Partial<OutboxRow>, owner?: string): Promise<boolean>;
  recordRun(run: SyncRun): Promise<void>;
  lastRun(p: Scope, scope: SyncScope): Promise<SyncRun | null>;
  /** AP 45 — Zählwerte für die Status-Zeile (`bridge/status.ts`), kein Freitext/PII. */
  stats(p: Scope): Promise<BridgeStats>;
  /** Aufräumen: Sync-Protokolle und zugestellte/abgeschlossene Outbox-Zeilen älter als `olderThan`. */
  cleanup(p: Scope, olderThan: Date): Promise<{ runs: number; outbox: number }>;
}

/** Aggregierte Zählwerte über die Bridge-DB einer Praxis, für die Status-Zeile. */
export type BridgeStats = {
  owners: number;
  patients: number;
  /** Wartende Einträge (`pending`), die noch versendet werden. */
  pendingOutbox: number;
  /** Gerade in Bearbeitung (`processing`) — laufende Übertragungen. */
  processingOutbox: number;
  /**
   * Endgültig gescheiterte (`failed`) und abgewiesene (`conflict`, `forbidden`)
   * Buchungen — sie brauchen einen Menschen.
   */
  failedOutbox: number;
  /**
   * Zeitpunkt der letzten ERFOLGREICHEN Stammdaten-Synchronisierung.
   *
   * Wichtig: Ein fehlgeschlagener Lauf zählt nicht. Früher wurde `finishedAt`
   * des letzten Laufs genommen, unabhängig von `ok` — dadurch konnte veralteter
   * Stand als frisch erscheinen.
   */
  lastMasterSyncAt: Date | null;
};

// -- Zeilentypen (DB-Sicht, snake_case) --------------------------------------

type OwnerRow = {
  id: string;
  external_id: string;
  external_hash: string;
  name: string;
  phone: string;
  phone_norm: string;
  email: string | null;
  raw: unknown;
  synced_at: string | Date;
  deleted_at: string | Date | null;
};

type PatientRow = {
  id: string;
  external_id: string;
  external_hash: string;
  owner_external_id: string;
  name: string;
  species: string | null;
  chip: string | null;
  raw: unknown;
  synced_at: string | Date;
  deleted_at: string | Date | null;
};

type NamedRow = {
  id: string;
  external_id: string;
  external_hash: string;
  name: string;
  raw: unknown;
  synced_at: string | Date;
  deleted_at: string | Date | null;
};

type HoursRow = { hours: unknown; synced_at: string | Date };

type OutboxDbRow = {
  id: string;
  practice_id: string;
  pms_kind: string;
  kind: string;
  payload: unknown;
  status: string;
  attempts: number;
  next_attempt_at: string | Date;
  result: unknown;
  created_at: string | Date;
  updated_at: string | Date;
  lease_owner?: string | null;
};

type SyncRunRow = {
  id: string;
  practice_id: string;
  pms_kind: string;
  scope: string;
  started_at: string | Date;
  finished_at: string | Date | null;
  ok: boolean;
  stats: unknown;
  error: string | null;
};

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

function newId(): string {
  return crypto.randomUUID();
}

/** JSON-Spalten kommen als Objekt (pg) oder als String (manche PGLite-Pfade) zurück. */
function toJson<T>(v: unknown): T {
  if (typeof v === "string") return JSON.parse(v) as T;
  return v as T;
}

function ownerFromRaw(raw: unknown): ConnectorOwner {
  return toJson<ConnectorOwner>(raw);
}

function patientFromRaw(raw: unknown): ConnectorPatient {
  return toJson<ConnectorPatient>(raw);
}

function namedFromRaw<T>(raw: unknown): T {
  return toJson<T>(raw);
}

/**
 * Punkt 17 — Alter einer Ergebnisliste konservativ bestimmen.
 *
 * Frueher bestimmte der NEUESTE Eintrag das Alter: eine einzige frische Zeile
 * machte die ganze Liste „frisch“, obwohl andere Eintraege alt waren. Damit
 * konnte die Bridge veraltete Treffer als aktuell ausgeben.
 *
 * Jetzt zaehlt der AELTESTE: nur wenn ALLE Eintraege frisch sind, gilt die
 * Liste als frisch.
 */
function oldestSyncedAt(rows: Array<{ synced_at: string | Date }>): Date {
  return rows.reduce(
    (oldest, row) => {
      const at = toDate(row.synced_at);
      return at < oldest ? at : oldest;
    },
    toDate(rows[0]!.synced_at),
  );
}

export function bridgeRepo(sql: Sql): BridgeRepo {  async function upsertGeneric<T extends { id: string }>(
    table: "pms_owners" | "pms_patients" | "pms_resources" | "pms_vets",
    p: Scope,
    rows: T[],
    extraCols: (row: T) => Record<string, unknown>,
  ): Promise<Counts> {
    const counts: Counts = { inserted: 0, updated: 0, unchanged: 0 };
    if (rows.length === 0) return counts;

    const externalIds = rows.map((r) => r.id);
    const existing = await sql.query<{ external_id: string; external_hash: string; deleted_at: Date | null }>(
      `select external_id, external_hash, deleted_at from ${table} where practice_id = $1 and pms_kind = $2 and external_id = any($3::text[])`,
      [p.practiceId, p.pmsKind, externalIds],
    );
    const existingHash = new Map(existing.map((r) => [r.external_id, r.external_hash]));
    const softDeleted = new Set(
      existing.filter((r) => r.deleted_at !== null).map((r) => r.external_id),
    );
    /** Bestaetigte, unveraenderte Zeilen — ihr Zeitstempel wird gebuendelt erneuert. */
    const confirmed: string[] = [];

    for (const row of rows) {
      const hash = canonicalHash(row);
      const prev = existingHash.get(row.id);
      if (prev === hash && !softDeleted.has(row.id)) {
        // Inhalt gleich: kein Schreiben der Nutzdaten. Der Zeitstempel wird
        // aber erneuert, weil der Anschluss die Zeile gerade BESTAETIGT hat.
        // Vorher blieb er stehen, und die Bridge hielt bestaetigte Daten fuer
        // veraltet und fragte den Anschluss erneut.
        counts.unchanged += 1;
        confirmed.push(row.id);
        continue;
      }
      const extra = extraCols(row);
      // Punkt 16: Ein zuvor weich geloeschter Datensatz, der wieder auftaucht,
      // hat denselben Inhalt wie vor dem Loeschen — `prev === hash`. Frueher
      // wurde er deshalb uebersprungen und blieb unsichtbar. Jetzt laeuft er
      // durch den Upsert und `deleted_at` wird wieder null.
      const cols = ["id", "practice_id", "pms_kind", "external_id", "external_hash", ...Object.keys(extra), "raw", "synced_at", "deleted_at"];
      const values: unknown[] = [
        newId(),
        p.practiceId,
        p.pmsKind,
        row.id,
        hash,
        ...Object.values(extra),
        JSON.stringify(row),
        new Date(),
        null,
      ];
      const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
      const updateSet = cols
        .filter((c) => c !== "id" && c !== "practice_id" && c !== "pms_kind" && c !== "external_id")
        .map((c) => `${c} = excluded.${c}`)
        .join(", ");
      await sql.query(
        `insert into ${table} (${cols.join(", ")}) values (${placeholders})
         on conflict (practice_id, pms_kind, external_id) do update set ${updateSet}`,
        values,
      );
      if (prev === undefined) counts.inserted += 1;
      else counts.updated += 1;
    }

    // Ein einziger Sammelbefehl statt einer Anweisung je Zeile.
    if (confirmed.length > 0) {
      await sql.query(
        `update ${table} set synced_at = $4
          where practice_id = $1 and pms_kind = $2 and external_id = any($3::text[])`,
        [p.practiceId, p.pmsKind, confirmed, new Date()],
      );
    }
    return counts;
  }

  return {
    async softDeleteMissing(p, entity, externalIds, at = new Date()) {
      const table = entity === "resources" ? "pms_resources" : "pms_vets";
      const result = await sql.query<{ id: string }>(
        `update ${table}
            set deleted_at = $4, synced_at = $4
          where practice_id = $1 and pms_kind = $2 and deleted_at is null
            and not (external_id = any($3::text[]))
          returning id`,
        [p.practiceId, p.pmsKind, externalIds, at],
      );
      return result.length;
    },
    async upsertOwners(p, rows) {
      return upsertGeneric("pms_owners", p, rows, (row) => ({
        name: row.name ?? "",
        phone: row.phones?.[0] ?? "",
        // Alle Nummern, jede als " <norm> " eingerahmt: Anruf von der Zweitnummer
        // (Festnetz/Mobil) trifft trotzdem. Suche: like '% <suffix> %'.
        phone_norm: (row.phones ?? [])
          .map((x) => normalizePhone(x))
          .filter(Boolean)
          .map((x) => ` ${x} `)
          .join(""),
        email: row.email ?? null,
      }));
    },

    async upsertPatients(p, ownerExternalId, rows) {
      return upsertGeneric("pms_patients", p, rows, (row) => ({
        owner_external_id: ownerExternalId,
        name: row.name ?? "",
        species: row.species ?? null,
        chip: row.chip ?? null,
      }));
    },

    async upsertResources(p, rows) {
      return upsertGeneric("pms_resources", p, rows, (row) => ({ name: row.name ?? "" }));
    },

    async upsertVets(p, rows) {
      return upsertGeneric("pms_vets", p, rows, (row) => ({ name: row.name ?? "" }));
    },

    async saveHours(p, hours) {
      const hash = canonicalHash(hours);
      const existing = await sql.query<{ external_hash: string }>(
        "select external_hash from pms_hours where practice_id = $1 and pms_kind = $2",
        [p.practiceId, p.pmsKind],
      );
      if (existing[0]?.external_hash === hash) {
        // Punkt 20: Inhalt unveraendert, aber der Anschluss hat ihn gerade
        // BESTAETIGT. Ohne neues synced_at hielt die Bridge die Zeiten fuer
        // veraltet und fragte den Anschluss erneut — derselbe Sonderfall, der
        // bei den uebrigen Stammdaten schon behoben ist.
        await sql.query(
          "update pms_hours set synced_at = $3 where practice_id = $1 and pms_kind = $2",
          [p.practiceId, p.pmsKind, new Date()],
        );
        return;
      }
      await sql.query(
        `insert into pms_hours (id, practice_id, pms_kind, external_hash, hours, synced_at)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (practice_id, pms_kind) do update set
           external_hash = excluded.external_hash, hours = excluded.hours, synced_at = excluded.synced_at`,
        [newId(), p.practiceId, p.pmsKind, hash, JSON.stringify(hours), new Date()],
      );
    },

    async findOwners(p, q) {
      const phone = q.phone?.trim();
      const name = q.name?.trim();
      // Ohne Suchkriterium waere das eine Abfrage des gesamten Bestands.
      if (!phone && !name) return { hit: false };
      const conditions = ["practice_id = $1", "pms_kind = $2", "deleted_at is null"];
      const values: unknown[] = [p.practiceId, p.pmsKind];
      if (phone) {
        values.push(`%${phoneSuffix(phone)} %`);
        conditions.push(`phone_norm like $${values.length}`);
      }
      if (name) {
        // Woertlich suchen: „%“ und „_“ sind sonst Platzhalter und liefern den
        // ganzen Bestand statt des gesuchten Namens.
        values.push(`%${escapeLikeNeedle(name)}%`);
        conditions.push(`name ilike $${values.length} escape '\\'`);
      }
      // Begrenzen: eine breite Suche darf nicht den ganzen Bestand laden.
      values.push(OWNER_SEARCH_LIMIT);
      const rows = await sql.query<OwnerRow>(
        `select * from pms_owners where ${conditions.join(" and ")} order by synced_at desc limit $${values.length}`,
        values,
      );
      if (rows.length === 0) return { hit: false };
      const syncedAt = oldestSyncedAt(rows);
      return { hit: true, data: rows.map((r) => ownerFromRaw(r.raw)), syncedAt };
    },

    async patientsOf(p, ownerExternalId) {
      const rows = await sql.query<PatientRow>(
        `select * from pms_patients where practice_id = $1 and pms_kind = $2 and owner_external_id = $3 and deleted_at is null order by synced_at desc`,
        [p.practiceId, p.pmsKind, ownerExternalId],
      );
      if (rows.length === 0) return { hit: false };
      const syncedAt = oldestSyncedAt(rows);
      return { hit: true, data: rows.map((r) => patientFromRaw(r.raw)), syncedAt };
    },

    async resources(p) {
      const rows = await sql.query<NamedRow>(
        `select * from pms_resources where practice_id = $1 and pms_kind = $2 and deleted_at is null order by synced_at desc`,
        [p.practiceId, p.pmsKind],
      );
      if (rows.length === 0) return { hit: false };
      const syncedAt = oldestSyncedAt(rows);
      return { hit: true, data: rows.map((r) => namedFromRaw<ConnectorResource>(r.raw)), syncedAt };
    },

    async vets(p) {
      const rows = await sql.query<NamedRow>(
        `select * from pms_vets where practice_id = $1 and pms_kind = $2 and deleted_at is null order by synced_at desc`,
        [p.practiceId, p.pmsKind],
      );
      if (rows.length === 0) return { hit: false };
      const syncedAt = oldestSyncedAt(rows);
      return { hit: true, data: rows.map((r) => namedFromRaw<ConnectorVet>(r.raw)), syncedAt };
    },

    async hours(p) {
      const rows = await sql.query<HoursRow>(
        "select hours, synced_at from pms_hours where practice_id = $1 and pms_kind = $2",
        [p.practiceId, p.pmsKind],
      );
      const row = rows[0];
      if (!row) return { hit: false };
      return { hit: true, data: toJson<ConnectorHours>(row.hours), syncedAt: toDate(row.synced_at) };
    },

    async enqueue(p, item) {
      const now = new Date();
      await sql.query(
        `insert into pms_outbox (id, practice_id, pms_kind, kind, payload, status, attempts, next_attempt_at, result, created_at, updated_at)
         values ($1, $2, $3, $4, $5, 'pending', 0, $6, null, $6, $6)
         on conflict (id) do nothing`,
        [item.id, p.practiceId, p.pmsKind, item.kind, JSON.stringify(item.payload), now],
      );
    },

    async getOutbox(p, id) {
      const rows = await sql.query<OutboxDbRow>(
        `select * from pms_outbox where practice_id = $1 and pms_kind = $2 and id = $3`,
        [p.practiceId, p.pmsKind, id],
      );
      const row = rows[0];
      return row ? outboxFromRow(row) : null;
    },

    async dueOutbox(p, now, limit) {
      const rows = await sql.query<OutboxDbRow>(
        `select * from pms_outbox where practice_id = $1 and pms_kind = $2 and status = 'pending' and next_attempt_at <= $3
         order by next_attempt_at asc limit $4`,
        [p.practiceId, p.pmsKind, now, limit],
      );
      return rows.map(outboxFromRow);
    },

    async claimOutbox(p, now, limit, onlyId, owner) {
      const leaseUntil = new Date(now.getTime() + OUTBOX_LEASE_MS);
      // Migration 0025: Reservierung setzt zusaetzlich den Besitzer, damit ein
      // spaeteres Ergebnis nur vom selben Prozess geschrieben werden kann.
      const rows = await sql.query<OutboxDbRow>(
        `select * from claim_pms_outbox($1, $2, $3, $4, $5, $6, $7)`,
        [p.practiceId, p.pmsKind, now, leaseUntil, owner ?? null, limit, onlyId ?? null],
      );
      return rows.map(outboxFromRow);
    },

    async renewOutboxLease(p, id, owner, leaseUntil, now) {
      // Migration 0027: nur wirksam, solange der Eintrag diesem Prozess gehoert.
      const rows = await sql.query<{ ok: boolean }>(
        `select renew_pms_outbox_lease($1, $2, $3, $4, $5, $6) as ok`,
        [p.practiceId, p.pmsKind, id, owner ?? null, leaseUntil, now],
      );
      return rows[0]?.ok === true;
    },

    async markOutbox(p, id, patch, owner) {
      const now = patch.updatedAt ?? new Date();
      // Migration 0025: nur schreiben, wenn die Reservierung noch diesem
      // Prozess gehoert. Ein ueberholter Lauf aendert nichts.
      const rows = await sql.query<{ ok: boolean }>(
        `select mark_pms_outbox($1, $2, $3, $4, $5, $6, $7, $8, $9) as ok`,
        [
          p.practiceId,
          p.pmsKind,
          id,
          owner ?? null,
          patch.status ?? null,
          patch.attempts ?? null,
          patch.nextAttemptAt ?? null,
          patch.result === undefined || patch.result === null ? null : JSON.stringify(patch.result),
          now,
        ],
      );
      return rows[0]?.ok === true;
    },

    async recordRun(run) {
      await sql.query(
        `insert into pms_sync_runs (id, practice_id, pms_kind, scope, started_at, finished_at, ok, stats, error)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (id) do update set finished_at = excluded.finished_at, ok = excluded.ok, stats = excluded.stats, error = excluded.error`,
        [
          run.id,
          run.practiceId,
          run.pmsKind,
          run.scope,
          run.startedAt,
          run.finishedAt,
          run.ok,
          JSON.stringify(run.stats),
          run.error,
        ],
      );
    },

    async lastRun(p, scope) {
      const rows = await sql.query<SyncRunRow>(
        `select * from pms_sync_runs where practice_id = $1 and pms_kind = $2 and scope = $3 order by started_at desc limit 1`,
        [p.practiceId, p.pmsKind, scope],
      );
      const row = rows[0];
      if (!row) return null;
      return syncRunFromRow(row);
    },

    async stats(p) {
      const [owners, patients, outbox, processing, failed, masterRun] = await Promise.all([
        sql.query<{ n: string }>(
          `select count(*)::text as n from pms_owners where practice_id = $1 and pms_kind = $2 and deleted_at is null`,
          [p.practiceId, p.pmsKind],
        ),
        sql.query<{ n: string }>(
          `select count(*)::text as n from pms_patients where practice_id = $1 and pms_kind = $2 and deleted_at is null`,
          [p.practiceId, p.pmsKind],
        ),
        sql.query<{ n: string }>(
          `select count(*)::text as n from pms_outbox where practice_id = $1 and pms_kind = $2 and status = 'pending'`,
          [p.practiceId, p.pmsKind],
        ),
        sql.query<{ n: string }>(
          `select count(*)::text as n from pms_outbox where practice_id = $1 and pms_kind = $2 and status = 'processing'`,
          [p.practiceId, p.pmsKind],
        ),
        sql.query<{ n: string }>(
          // `failed` braucht einen Menschen; `conflict` und `forbidden` ebenso —
          // sie sind abgewiesen und werden nicht erneut versendet.
          `select count(*)::text as n from pms_outbox where practice_id = $1 and pms_kind = $2 and status in ('failed', 'conflict', 'forbidden')`,
          [p.practiceId, p.pmsKind],
        ),
        sql.query<SyncRunRow>(
          // Nur ein ERFOLGREICHER Lauf zählt als letzte Synchronisierung.
          `select * from pms_sync_runs where practice_id = $1 and pms_kind = $2 and scope = 'master' and ok = true order by started_at desc limit 1`,
          [p.practiceId, p.pmsKind],
        ),
      ]);
      const run = masterRun[0] ? syncRunFromRow(masterRun[0]) : null;
      return {
        owners: Number(owners[0]?.n ?? 0),
        patients: Number(patients[0]?.n ?? 0),
        pendingOutbox: Number(outbox[0]?.n ?? 0),
        processingOutbox: Number(processing[0]?.n ?? 0),
        failedOutbox: Number(failed[0]?.n ?? 0),
        lastMasterSyncAt: run?.finishedAt ?? null,
      };
    },

    async cleanup(p, olderThan) {
      // Nur Sync-Protokolle aufräumen.
      const runs = await sql.query<{ id: string }>(
        `delete from pms_sync_runs where practice_id = $1 and pms_kind = $2 and started_at < $3 returning id`,
        [p.practiceId, p.pmsKind, olderThan],
      );
      // Zugestellte Einträge (`sent`) sind abgeschlossen und dürfen weg.
      //
      // `pending` wird noch versendet. `failed`, `conflict` und `forbidden`
      // bleiben stehen: sie brauchen einen Menschen. Früher wurde `conflict`
      // nach der Frist gelöscht, ohne dass jemand den Konflikt geprüft hatte —
      // die Tierarzthelferin erfuhr dann nie davon.
      const outbox = await sql.query<{ id: string }>(
        `delete from pms_outbox where practice_id = $1 and pms_kind = $2 and status = 'sent' and updated_at < $3 returning id`,
        [p.practiceId, p.pmsKind, olderThan],
      );
      return { runs: runs.length, outbox: outbox.length };
    },
  };
}

function outboxFromRow(row: OutboxDbRow): OutboxRow {
  return {
    id: row.id,
    practiceId: row.practice_id,
    pmsKind: row.pms_kind,
    kind: row.kind as "appointment",
    payload: toJson(row.payload),
    status: row.status as OutboxRow["status"],
    attempts: row.attempts,
    nextAttemptAt: toDate(row.next_attempt_at),
    result: row.result === null ? null : toJson(row.result),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    leaseOwner: row.lease_owner ?? null,
  };
}

function syncRunFromRow(row: SyncRunRow): SyncRun {
  return {
    id: row.id,
    practiceId: row.practice_id,
    pmsKind: row.pms_kind,
    scope: row.scope as SyncScope,
    startedAt: toDate(row.started_at),
    finishedAt: row.finished_at === null ? null : toDate(row.finished_at),
    ok: row.ok,
    stats: toJson(row.stats),
    error: row.error,
  };
}
