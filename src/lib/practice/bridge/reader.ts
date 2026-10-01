/**
 * BridgeReader — Read-through-Fassade über den `PraxissoftwarePort` (AP 44,
 * siehe docs/PLAN_PMS_Bridge.md Abschnitt 4.5). Implementiert **denselben**
 * Port wie die Live-Adapter, damit Alma/Buchung/Tafel keine Ahnung haben,
 * ob sie aus der Bridge-DB oder direkt vom Adapter lesen.
 *
 * Strategie (exakt wie im Plan):
 * - `health`/`capabilities`: immer Adapter, kein Cache.
 * - `resources`/`vets`/`hours`: frischer Bridge-Treffer (< `maxAgeMs`, Default
 *   24 h) → zurückgeben. Sonst Adapter fragen; bei `ok` in die Bridge
 *   schreiben und zurückgeben; bei Adapter-Fehler und vorhandenem (auch
 *   veraltetem) Bridge-Treffer → Bridge-Daten (Offline-Resilienz). Sonst
 *   Adapter-Fehler durchreichen.
 * - `findOwners`/`patientsOf`: gleiche Strategie, `ownerMaxAgeMs` Default 1 h.
 * - `freeSlots`: immer Adapter (Echtzeit), nie gecacht.
 * - `createAppointment`: deterministische Outbox-ID (SHA-256 über
 *   practiceId|ownerId|patientId|resourceId|start) für Idempotenz, sofort
 *   `flushOutboxItem` versuchen und das Ergebnis synchron zurückgeben — der
 *   Dialog braucht die Antwort in diesem Zug.
 * - `sendAkte`/`sendSlot`/`sendKontakt`: bleiben `notConnected` (Tafel-Pfad).
 *
 * Wirft nie. Jede Methode löst wie der zugrunde liegende Port auf.
 */

import { createHash } from "node:crypto";
import type {
  BridgeRepo,
  BridgeHit,
  OutboxRow,
  Scope,
} from "./repo.ts";
import { syncEngine } from "./sync.ts";
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
import { notConnected } from "../praxissoftware.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export interface BridgeReaderDeps {
  repo: BridgeRepo;
  adapter: PraxissoftwarePort;
  scope: Scope;
  /** Default 24 h — Stammdaten (Ressourcen, Tierärztinnen, Öffnungszeiten). */
  maxAgeMs?: number;
  /** Default 1 h — Personendaten (Halter, Patientinnen). */
  ownerMaxAgeMs?: number;
  now?: () => Date;
  /** Fehlerzeile ohne PII; Default: still. */
  log?: (msg: string) => void;
}

function errorText(_err: unknown): string {
  // Fehlertexte aus DB/Adaptern können versehentlich PII enthalten. Im Log
  // genügt eine konstante Meldung; Details gehören nicht in die Bridge.
  return "Interner Bridge-Fehler";
}

/** Alter eines Treffers in Millisekunden; ohne Treffer unendlich. */
function ageOf<T>(hit: BridgeHit<T>, now: () => Date): number {
  if (!hit.hit) return Number.POSITIVE_INFINITY;
  return Math.max(0, now().getTime() - hit.syncedAt.getTime());
}

/**
 * Hoechstalter fuer Ersatzdaten aus dem Zwischenspeicher.
 *
 * Bei einem laengeren Ausfall der Praxissoftware duerfen alte Daten nicht
 * unbegrenzt als verlaesslich gelten — besonders Oeffnungszeiten nicht. Aelter
 * als das wird lieber ehrlich nichts geliefert als etwas Veraltetes.
 */
export const FALLBACK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isFresh<T>(hit: BridgeHit<T>, maxAgeMs: number, now: () => Date): boolean {
  if (!hit.hit) return false;
  return now().getTime() - hit.syncedAt.getTime() < maxAgeMs;
}

export function bridgeReader(deps: BridgeReaderDeps): PraxissoftwarePort {
  const { repo, adapter, scope } = deps;
  const maxAgeMs = deps.maxAgeMs ?? DAY_MS;
  const ownerMaxAgeMs = deps.ownerMaxAgeMs ?? HOUR_MS;
  const now = deps.now ?? (() => new Date());
  /**
   * Für `createAppointment`: dieselbe SyncEngine wie AP 43, mit demselben
   * Repo/Adapter/Scope/now — versendet genau den soeben eingereihten Eintrag
   * synchron (der Dialog braucht die Antwort in diesem Zug).
   */
  const outboxSync = syncEngine({ repo, adapter, scope, now });

  /**
   * Generische Read-through-Strategie für die "Stammdaten"-artigen Methoden
   * (resources/vets/hours/findOwners/patientsOf): frisch aus der Bridge → hit;
   * sonst Adapter fragen, bei Erfolg in die Bridge schreiben; bei Adapter-
   * Fehler auf einen (auch veralteten) Bridge-Treffer zurückfallen.
   */
  async function readThrough<T>(opts: {
    ageMs: number;
    /** Hoechstalter des Ersatzes; Default `FALLBACK_MAX_AGE_MS`. */
    fallbackMaxAgeMs?: number;
    bridgeRead: () => Promise<BridgeHit<T>>;
    adapterRead: () => Promise<PraxissoftwareReadResult<T>>;
    onAdapterOk: (data: T) => Promise<void>;
  }): Promise<PraxissoftwareReadResult<T>> {
    // Die Bridge-DB darf den Dialog nie blockieren: Lesefehler = Miss,
    // Schreibfehler werden verschluckt (ohne PII geloggt), der Adapter zaehlt.
    let hit: BridgeHit<T> = { hit: false };
    try {
      hit = await opts.bridgeRead();
    } catch (err) {
      deps.log?.(`[bridge] Lesen fehlgeschlagen: ${errorText(err)}`);
    }
    if (hit.hit && isFresh(hit, opts.ageMs, now)) {
      return { ok: true, data: hit.data };
    }

    let adapterRes: PraxissoftwareReadResult<T>;
    try {
      adapterRes = await opts.adapterRead();
    } catch (err) {
      deps.log?.(`[bridge] Adapter-Lesen fehlgeschlagen: ${errorText(err)}`);
      adapterRes = { ok: false, reason: "error" };
    }
    if (adapterRes.ok) {
      try {
        await opts.onAdapterOk(adapterRes.data);
      } catch (err) {
        deps.log?.(`[bridge] Schreiben fehlgeschlagen: ${errorText(err)}`);
      }
      return adapterRes;
    }

    if (hit.hit) {
      // Veralteter Ersatz: nur bis zu einem Hoechstalter, und sichtbar
      // gekennzeichnet. Frueher kam er als normales ok:true zurueck und war
      // von frischen Daten nicht zu unterscheiden.
      if (ageOf(hit, now) <= (opts.fallbackMaxAgeMs ?? FALLBACK_MAX_AGE_MS)) {
        return { ok: true, data: hit.data, stale: true };
      }
      deps.log?.("[bridge] Ersatzdaten zu alt, nicht mehr verwendet");
    }
    return adapterRes;
  }

  async function resources(): Promise<PraxissoftwareReadResult<ConnectorResource[]>> {
    return readThrough<ConnectorResource[]>({
      ageMs: maxAgeMs,
      bridgeRead: () => repo.resources(scope),
      adapterRead: () => adapter.resources(),
      onAdapterOk: async (data) => {
        await repo.upsertResources(scope, data);
      },
    });
  }

  async function vets(): Promise<PraxissoftwareReadResult<ConnectorVet[]>> {
    return readThrough<ConnectorVet[]>({
      ageMs: maxAgeMs,
      bridgeRead: () => repo.vets(scope),
      adapterRead: () => adapter.vets(),
      onAdapterOk: async (data) => {
        await repo.upsertVets(scope, data);
      },
    });
  }

  async function hours(): Promise<PraxissoftwareReadResult<ConnectorHours>> {
    return readThrough<ConnectorHours>({
      ageMs: maxAgeMs,
      bridgeRead: () => repo.hours(scope),
      adapterRead: () => adapter.hours(),
      onAdapterOk: async (data) => {
        await repo.saveHours(scope, data);
      },
    });
  }

  async function findOwners(params: {
    phone?: string;
    name?: string;
  }): Promise<PraxissoftwareReadResult<ConnectorOwner[]>> {
    // Ohne Suchkriterium wird nicht gesucht. Sonst ginge eine leere Anfrage an
    // den Adapter und von dort an die Praxissoftware, die daraufhin ihren
    // ganzen Halterbestand liefern kann.
    if (!String(params.phone ?? "").trim() && !String(params.name ?? "").trim()) {
      return { ok: false, reason: "error" };
    }
    return readThrough<ConnectorOwner[]>({
      ageMs: ownerMaxAgeMs,
      bridgeRead: () => repo.findOwners(scope, params),
      adapterRead: () => adapter.findOwners(params),
      onAdapterOk: async (data) => {
        await repo.upsertOwners(scope, data);
      },
    });
  }

  async function patientsOf(ownerId: string): Promise<PraxissoftwareReadResult<ConnectorPatient[]>> {
    return readThrough<ConnectorPatient[]>({
      ageMs: ownerMaxAgeMs,
      bridgeRead: () => repo.patientsOf(scope, ownerId),
      adapterRead: () => adapter.patientsOf(ownerId),
      onAdapterOk: async (data) => {
        await repo.upsertPatients(scope, ownerId, data);
      },
    });
  }

  /**
   * Deterministische Outbox-ID — gleiche Anfrage erzeugt immer denselben
   * Eintrag (Idempotenz).
   *
   * `pmsKind` gehört in den Schlüssel: Beim Wechsel der Praxissoftware entstünde
   * sonst dieselbe Kennung. Der vorhandene Eintrag ist bereits an das ALTE
   * Programm gesendet, `on conflict (id) do nothing` verwirft den neuen, und die
   * Buchung erreicht das neue Programm nie.
   */
  function outboxId(request: ConnectorAppointmentRequest): string {
    const raw = [
      scope.practiceId,
      scope.pmsKind,
      request.ownerId,
      request.patientId,
      request.resourceId,
      request.start,
    ].join("|");
    return createHash("sha256").update(raw).digest("hex");
  }

  function mapOutboxResult(row: OutboxRow | null): PraxissoftwareWriteResult<ConnectorAppointmentResult> {
    if (!row) return { ok: false, reason: "error" };
    switch (row.status) {
      case "sent":
        return { ok: true, data: row.result as unknown as ConnectorAppointmentResult };
      case "conflict":
        return { ok: false, reason: "conflict" };
      case "forbidden":
        return { ok: false, reason: "forbidden" };
      case "pending":
      case "failed":
      default:
        return { ok: false, reason: "error" };
    }
  }

  async function createAppointment(
    request: ConnectorAppointmentRequest,
  ): Promise<PraxissoftwareWriteResult<ConnectorAppointmentResult>> {
    const id = outboxId(request);
    try {
      await repo.enqueue(scope, { id, kind: "appointment", payload: request });
      await outboxSync.flushOutboxItem(id);
      const row = await repo.getOutbox(scope, id);
      return mapOutboxResult(row);
    } catch (err) {
      // Eine defekte Outbox darf niemals einen ungeplanten Direkt-Schreibzugriff auslösen.
      // Die Buchung bleibt beim sicheren Tafel-/Wiederholungsweg.
      deps.log?.(`[bridge] Outbox fehlgeschlagen, kein Direkt-Schreiben: ${errorText(err)}`);
      return { ok: false, reason: "error" };
    }
  }

  return {
    kind: adapter.kind,
    label: adapter.label,
    host: adapter.host,
    sendAkte: () => notConnected(),
    sendSlot: () => notConnected(),
    sendKontakt: () => notConnected(),
    health: () => adapter.health(),
    capabilities: () => adapter.capabilities(),
    resources,
    vets,
    hours,
    findOwners,
    patientsOf,
    freeSlots: (params) => adapter.freeSlots(params),
    createAppointment,
  };
}
