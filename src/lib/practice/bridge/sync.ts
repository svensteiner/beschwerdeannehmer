/**
 * SyncEngine — Pull (Stammdaten, Halter) + Outbox-Flush (AP 43, siehe
 * docs/PLAN_PMS_Bridge.md Abschnitt 4.4). Zieht Daten vom `PraxissoftwarePort`
 * in die Bridge-DB (`BridgeRepo`) und sendet fällige Outbox-Einträge zurück
 * an den Adapter (`createAppointment`). Wirft nie — jeder Lauf endet als
 * `SyncRun` mit `ok`/`error`, egal was der Adapter oder das Repo tun.
 *
 * Keine PII in `error`: nur Klartext-Fehlermeldungen ohne Namen/Telefon/Mail
 * (die stecken höchstens in `stats`-Zahlen, nie in Freitext).
 */

import { randomUUID } from "node:crypto";
import type {
  ConnectorAppointmentResult,
  PraxissoftwarePort,
  PraxissoftwareWriteReason,
} from "../praxissoftware.ts";
import { OUTBOX_LEASE_MS, type BridgeRepo, type OutboxRow, type Scope, type SyncRun, type SyncScope } from "./repo.ts";

export interface SyncEngine {
  syncMasterData(): Promise<SyncRun>;
  syncOwnerByPhone(phone: string): Promise<SyncRun>;
  syncOwnerByName(name: string): Promise<SyncRun>;
  flushOutbox(now?: Date): Promise<SyncRun>;
  /** Für den BridgeReader (AP 44): genau einen fälligen Eintrag sofort versuchen. */
  flushOutboxItem(id: string): Promise<SyncRun>;
}

export interface SyncEngineDeps {
  repo: BridgeRepo;
  adapter: PraxissoftwarePort;
  scope: Scope;
  now?: () => Date;
  log?: (msg: string) => void;
}

/** `min(2^attempts, 60)` Minuten, wie im Plan (4.4) festgelegt. */
const OUTBOX_MAX_BACKOFF_MINUTES = 60;
/** Ab `attempts >= 8` gilt der Eintrag als endgültig gescheitert. */
const OUTBOX_MAX_ATTEMPTS = 8;

/**
 * Kennung einer Outbox-Runde. Die Reservierung merkt sich diese Kennung; nur
 * derselbe Prozess darf das Ergebnis später schreiben. Enthält keine Praxis-
 * oder Personendaten.
 */
function newOwner(): string {
  return randomUUID();
}
/** Bewusst klein — `flushOutbox()` soll einen Lauf nicht unbegrenzt blockieren. */
const OUTBOX_BATCH_LIMIT = 20;

function errorMessage(_err: unknown): string {
  // Adapter-/DB-Fehlertexte können PII enthalten; nie in SyncRun oder Logs
  // persistieren. Die Statusanzeige braucht nur eine neutrale Fehlerklasse.
  return "Interner Bridge-Fehler";
}

export function syncEngine(deps: SyncEngineDeps): SyncEngine {
  const { repo, adapter, scope } = deps;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => {});

  async function runRecorded(
    syncScope: SyncScope,
    body: (stats: Record<string, unknown>) => Promise<void>,
  ): Promise<SyncRun> {
    const id = randomUUID();
    const startedAt = now();
    const stats: Record<string, unknown> = {};
    let ok = true;
    let error: string | null = null;
    try {
      await body(stats);
    } catch (err) {
      ok = false;
      error = errorMessage(err);
      log(`pms-sync ${syncScope} fehlgeschlagen: ${error}`);
    }
    const run: SyncRun = {
      id,
      practiceId: scope.practiceId,
      pmsKind: scope.pmsKind,
      scope: syncScope,
      startedAt,
      finishedAt: now(),
      ok,
      stats,
      error,
    };
    // Das Protokollieren darf den Lauf nie zum Werfen bringen (z. B. DB weg,
    // Fremdschluessel): Ergebnis bleibt gueltig, Fehler wird nur geloggt.
    try {
      await repo.recordRun(run);
    } catch (err) {
      const msg = errorMessage(err);
      log(`pms-sync ${syncScope}: Protokoll nicht gespeichert: ${msg}`);
      if (run.ok) return { ...run, ok: false, error: `Protokoll nicht gespeichert: ${msg}` };
    }
    return run;
  }

  async function syncMasterData(): Promise<SyncRun> {
    return runRecorded("master", async (stats) => {
      const [resourcesRes, vetsRes, hoursRes] = await Promise.all([
        adapter.resources(),
        adapter.vets(),
        adapter.hours(),
      ]);

      if (resourcesRes.ok) {
        const counts = await repo.upsertResources(scope, resourcesRes.data);
        const deleted = await repo.softDeleteMissing(scope, "resources", resourcesRes.data.map((row) => row.id));
        stats.resources = { ...counts, deleted };
      } else {
        stats.resources = { ok: false, reason: resourcesRes.reason };
      }

      if (vetsRes.ok) {
        const counts = await repo.upsertVets(scope, vetsRes.data);
        const deleted = await repo.softDeleteMissing(scope, "vets", vetsRes.data.map((row) => row.id));
        stats.vets = { ...counts, deleted };
      } else {
        stats.vets = { ok: false, reason: vetsRes.reason };
      }

      if (hoursRes.ok) {
        await repo.saveHours(scope, hoursRes.data);
        stats.hours = { ok: true };
      } else {
        stats.hours = { ok: false, reason: hoursRes.reason };
      }

      if (!resourcesRes.ok || !vetsRes.ok || !hoursRes.ok) {
        throw new Error("Stammdaten-Sync: mindestens ein Teilabruf fehlgeschlagen");
      }
    });
  }

  async function syncOwners(query: { phone?: string; name?: string }, syncScope: SyncScope): Promise<SyncRun> {
    return runRecorded(syncScope, async (stats) => {
      const ownersRes = await adapter.findOwners(query);
      if (!ownersRes.ok) {
        throw new Error(`Halter-Sync: Adapter nicht erreichbar (${ownersRes.reason})`);
      }

      const ownerCounts = await repo.upsertOwners(scope, ownersRes.data);
      stats.owners = ownerCounts;

      const patientStats: Record<string, unknown> = {};
      let failedPatients = 0;
      for (const owner of ownersRes.data) {
        const patientsRes = await adapter.patientsOf(owner.id);
        if (patientsRes.ok) {
          patientStats[owner.id] = await repo.upsertPatients(scope, owner.id, patientsRes.data);
        } else {
          // Ein fehlgeschlagener Teilabruf darf den Halterabgleich nicht als
          // vollen Erfolg erscheinen lassen: die Patienten fehlen dann in der
          // Bridge, und der Dialog haelt sie faelschlich fuer unbekannt.
          failedPatients += 1;
          patientStats[owner.id] = { ok: false, reason: patientsRes.reason };
        }
      }
      stats.patients = patientStats;
      stats.patientsPartial = failedPatients;
      if (failedPatients > 0) {
        throw new Error("Halter-Sync: mindestens ein Teilabruf der Patienten fehlgeschlagen");
      }
    });
  }

  async function syncOwnerByPhone(phone: string): Promise<SyncRun> {
    return syncOwners({ phone }, "owner");
  }

  async function syncOwnerByName(name: string): Promise<SyncRun> {
    return syncOwners({ name }, "owner");
  }

  /**
   * Ergebnis eines einzelnen `createAppointment`-Versuchs auf den Outbox-Eintrag
   * anwenden. `owner` ist die Reservierungskennung des laufenden Prozesses.
   */
  /**
   * Ergebnis in die Outbox schreiben und melden, ob es angekommen ist.
   *
   * `markOutbox` gibt `false` zurueck, wenn die Reservierung inzwischen einem
   * anderen Prozess gehoert. Dann darf dieser Lauf NICHT „gesendet“
   * protokollieren — die Zeile gehoert einem neueren Lauf.
   */
  async function writeOutboxResult(
    row: OutboxRow,
    patch: {
      status: OutboxRow["status"];
      attempts?: number;
      nextAttemptAt?: Date;
      result?: Record<string, unknown> | null;
    },
  ): Promise<boolean> {
    return repo.markOutbox(scope, row.id, patch, row.leaseOwner ?? undefined);
  }

  /**
   * Reservierung erneuern und pruefen, ob dieser Prozess den Eintrag noch haelt.
   *
   * Ohne `renewOutboxLease` (einfache Test-Doubles) gilt der Eintrag als
   * gehalten — dann bleibt das Verhalten wie vor der Pruefung.
   */
  async function renewLease(row: OutboxRow, at: Date): Promise<boolean> {
    if (!repo.renewOutboxLease) return true;
    const leaseUntil = new Date(at.getTime() + OUTBOX_LEASE_MS);
    try {
      return await repo.renewOutboxLease(scope, row.id, row.leaseOwner ?? undefined, leaseUntil, at);
    } catch (err) {
      // Ein Datenbankfehler beim Erneuern darf die Runde nicht beenden. Ohne
      // gueltige Reservierung wird aber nicht uebertragen.
      log(`pms-sync outbox: Reservierung nicht erneuerbar: ${errorMessage(err)}`);
      return false;
    }
  }

  /** Kennzeichnet einen Eintrag, dessen Ergebnis ein anderer Lauf uebernommen hat. */
  function superseded(row: OutboxRow): Record<string, unknown> {
    return { id: row.id, status: "superseded" };
  }

  async function applyOutboxResult(
    row: OutboxRow,
    result: { ok: true; data: ConnectorAppointmentResult } | { ok: false; reason: PraxissoftwareWriteReason },
    at: Date,
  ): Promise<Record<string, unknown>> {
    if (result.ok) {
      const written = await writeOutboxResult(row, {
        status: "sent",
        result: result.data,
        attempts: row.attempts,
      });
      return written ? { id: row.id, status: "sent" } : superseded(row);
    }

    if (result.reason === "conflict" || result.reason === "forbidden") {
      const written = await writeOutboxResult(row, {
        status: result.reason,
        result: { reason: result.reason },
      });
      return written ? { id: row.id, status: result.reason } : superseded(row);
    }

    // notConnected/error (PraxissoftwareWriteReason kennt kein "timeout"): Wiederholung
    // mit exponentiellem Backoff, gedeckelt.
    const attempts = row.attempts + 1;
    if (attempts >= OUTBOX_MAX_ATTEMPTS) {
      const written = await writeOutboxResult(row, {
        status: "failed",
        attempts,
        result: { reason: result.reason },
      });
      return written ? { id: row.id, status: "failed" } : superseded(row);
    }

    const backoffMinutes = Math.min(2 ** attempts, OUTBOX_MAX_BACKOFF_MINUTES);
    const nextAttemptAt = new Date(at.getTime() + backoffMinutes * 60_000);
    const written = await writeOutboxResult(row, {
      status: "pending",
      attempts,
      nextAttemptAt,
      result: { reason: result.reason },
    });
    if (!written) return superseded(row);
    return { id: row.id, status: "pending", attempts, nextAttemptAt: nextAttemptAt.toISOString() };
  }

  /**
   * Alle reservierten Zeilen abarbeiten.
   *
   * Ein Fehler bei EINER Uebertragung darf die uebrigen nicht blockieren: der
   * Aufruf wird einzeln gefangen, der Eintrag als Fehlversuch gezaehlt und die
   * Schleife laeuft weiter. Eine geworfene Ausnahme liess frueher die gesamte
   * Runde abbrechen, sodass spaetere Eintraege nie versendet wurden.
   *
   * Auch das SPEICHERN des Fehlerstatus ist gefangen: scheitert die Datenbank
   * nach einem Uebertragungsfehler, darf sie nicht die restliche Runde
   * mitreissen.
   *
   * Vor JEDER Uebertragung wird die Reservierung erneuert und geprueft. Die
   * Runde reserviert alle Eintraege gemeinsam fuer fuenf Minuten; dauert sie
   * laenger, lief die Reservierung spaeterer Eintraege vorher ab und ein
   * zweiter Prozess durfte denselben Termin noch einmal buchen.
   */
  async function flushRows(rows: OutboxRow[], stats: Record<string, unknown>): Promise<void> {
    const at = now();
    const items: unknown[] = [];
    for (const row of rows) {
      const held = await renewLease(row, at);
      if (!held) {
        // Ein anderer Prozess hat den Eintrag uebernommen: nicht uebertragen.
        items.push(superseded(row));
        continue;
      }
      try {
        const result = await adapter.createAppointment(
          row.payload as Parameters<PraxissoftwarePort["createAppointment"]>[0],
        );
        items.push(await applyOutboxResult(row, result, at));
      } catch {
        // Der Eintrag bleibt sonst in `processing` haengen. Adapter- und
        // Datenbankfehler werden getrennt gemeldet, damit die Ursache sichtbar
        // bleibt und die Schleife weiterlaeuft.
        const attempts = row.attempts + 1;
        const failed = attempts >= OUTBOX_MAX_ATTEMPTS;
        const nextAttemptAt = new Date(
          at.getTime() + Math.min(2 ** attempts, OUTBOX_MAX_BACKOFF_MINUTES) * 60_000,
        );
        try {
          await repo.markOutbox(
            scope,
            row.id,
            failed
              ? { status: "failed", attempts, result: { reason: "error" } }
              : { status: "pending", attempts, nextAttemptAt, result: { reason: "error" } },
            row.leaseOwner ?? undefined,
          );
        } catch {
          // Auch das Speichern des Fehlers ist gescheitert. Der Eintrag bleibt
          // fuer einen spaeteren Lauf reserviert; die Runde laeuft weiter.
        }
        items.push(failed
          ? { id: row.id, status: "failed" }
          : { id: row.id, status: "pending", attempts });
      }
    }
    stats.outbox = items;
  }

  async function flushOutbox(atArg?: Date): Promise<SyncRun> {
    return runRecorded("outbox", async (stats) => {
      const at = atArg ?? now();
      // Jede Runde bekommt eine eigene Kennung. Nur sie darf Ergebnisse
      // schreiben, damit ein ueberholter Lauf nichts ueberschreibt.
      const owner = newOwner();
      const rows = repo.claimOutbox
        ? await repo.claimOutbox(scope, at, OUTBOX_BATCH_LIMIT, undefined, owner)
        : await repo.dueOutbox(scope, at, OUTBOX_BATCH_LIMIT);
      await flushRows(rows, stats);
    });
  }

  async function flushOutboxItem(id: string): Promise<SyncRun> {
    return runRecorded("outbox", async (stats) => {
      const at = now();
      const owner = newOwner();
      const rows = repo.claimOutbox
        ? await repo.claimOutbox(scope, at, OUTBOX_BATCH_LIMIT, id, owner)
        : await repo.dueOutbox(scope, at, OUTBOX_BATCH_LIMIT);
      const row = rows.find((r) => r.id === id);
      if (!row) {
        stats.outbox = [];
        return;
      }
      await flushRows([row], stats);
    });
  }

  return { syncMasterData, syncOwnerByPhone, syncOwnerByName, flushOutbox, flushOutboxItem };
}
