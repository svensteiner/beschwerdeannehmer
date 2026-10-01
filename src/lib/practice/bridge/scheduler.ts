/**
 * Hintergrund-Sync fuer `npm start` (AP 45, siehe docs/PLAN_PMS_Bridge.md Abschnitt 4.6).
 * No-op solange `SILVIA_PMS_SYNC_MINUTES` nicht auf eine Zahl > 0 steht — Standardbetrieb
 * bleibt unveraendert. Wenn aktiv: alle N Minuten fuer jede Praxis mit hinterlegter (und
 * registrierter) Praxissoftware `syncMasterData()` + `flushOutbox()` (dieselben Bausteine
 * wie `/api/pms-sync`, `bridge/runtime.ts`). Fehler werden abgefangen und ohne PII
 * geloggt — nie ein Tick bricht den Scheduler.
 *
 * Punkte 14-17:
 * 14. Der erste Lauf startet jetzt SOFORT statt erst nach einem ganzen Intervall.
 * 15. `stop()` wartet auf einen laufenden Durchgang und verhindert neue Arbeit.
 * 16. Jede Praxis hat eine Zeitgrenze, damit eine haengende Verbindung die
 *     nachfolgenden Praxen nicht blockiert.
 * 17. Eine Reservierung in der gemeinsamen Datenbank koordiniert mehrere Server.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db";
import { hasPraxissoftwareAdapter } from "../praxissoftware.ts";
import { bridgeSyncForWith } from "./runtime.ts";
import type { SyncEngine } from "./sync.ts";
import type { BridgeRepo } from "./repo.ts";
import type { Scope } from "./schema.ts";

type Deps = {
  getSql: () => Promise<Sql>;
  setInterval: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (id: ReturnType<typeof setInterval>) => void;
  log?: (msg: string) => void;
  /** Fuer Tests: Fake-`SyncEngine` statt der echten Bridge/`adapterFor`-Bausteine. */
  syncFor?: (sql: Sql, practiceId: string, pms: string) => { engine: SyncEngine };
  /** Punkt 14: false laesst den Sofortstart weg (fuer Tests). */
  runOnStart?: boolean;
  /** Punkt 16: Zeitgrenze je Praxis in Millisekunden. */
  practiceTimeoutMs?: number;
  /** Punkt 3: Wartezeit beim Herunterfahren auf Hintergrundarbeit. */
  stopDrainMs?: number;
};

export type BridgeScheduler = {
  /**
   * Punkt 15: beendet den Timer und liefert ein Versprechen, das nach dem
   * laufenden Durchgang erfuellt ist. Wer sauber herunterfahren will, wartet
   * darauf — vorher lief eine bereits gestartete Uebertragung weiter.
   */
  stop(): Promise<void>;
};

/** `SILVIA_PMS_SYNC_MINUTES` muss eine ganze Zahl > 0 sein, sonst bleibt der Scheduler aus. */
export function parseSyncMinutes(env: NodeJS.ProcessEnv): number {
  const raw = String(env.SILVIA_PMS_SYNC_MINUTES ?? "").trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const CLEANUP_DAYS = 30;

/**
 * Punkt 16 — Zeitgrenze je Praxis.
 *
 * Eine dauerhaft wartende Verbindung blockierte bisher die gesamte Runde:
 * alle nachfolgenden Praxen warteten mit, und der naechste Tick uebersprang
 * sich selbst. Nach dieser Grenze gilt die Praxis als nicht erledigt und die
 * Runde laeuft weiter.
 *
 * Ehrliche Grenze: das Abbruchsignal beendet den laufenden Aufruf NICHT, es
 * loest nur das Warten. Der Aufruf laeuft im Hintergrund aus; deshalb bleibt
 * die Reservierung vorsorglich bestehen und laeuft mit ihrer Frist ab.
 */
export const PRACTICE_SYNC_TIMEOUT_MS = 60_000;

export function practiceSyncTimeoutMs(env: NodeJS.ProcessEnv): number {
  const raw = String(env.SILVIA_PMS_SYNC_TIMEOUT_SECONDS ?? "").trim();
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return PRACTICE_SYNC_TIMEOUT_MS;
  return Math.min(seconds * 1000, 30 * 60_000);
}

/**
 * Wartet auf `work`, hoechstens `ms`. `timedOut: true` heisst: die Grenze griff.
 *
 * Bei einer Zeitgrenze laeuft `work` im Hintergrund weiter. Eine spaetere
 * Ablehnung darf deshalb keine unbehandelte Ausnahme erzeugen — der Aufrufer
 * bekommt sie nicht mehr zu sehen.
 */
export async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  if (!Number.isFinite(ms) || ms <= 0) return { timedOut: false, value: await work };

  let settled = false;
  const guarded = work.then(
    (value) => {
      settled = true;
      return { timedOut: false as const, value };
    },
    (err: unknown) => {
      settled = true;
      throw err;
    },
  );
  // Markiert `guarded` als behandelt, ohne das Ergebnis zu veraendern. Ohne das
  // wuerde eine Ablehnung nach der Zeitgrenze als unbehandelt gelten.
  guarded.catch(() => undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      guarded,
      new Promise<{ timedOut: true }>((resolve) => {
        timer = setTimeout(() => {
          if (!settled) resolve({ timedOut: true });
        }, ms);
        // Bewusst NICHT `unref()`: dieser Timer ist die begrenzte Wartezeit
        // selbst, keine Hintergrund-Schleife. Haengt `work` ohne echten
        // I/O-Handle (z. B. ein nacktes Promise), wuerde die Event-Schleife mit
        // `unref()` vorher austrocknen und die Grenze griffe nie.
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Reservierung in der gemeinsamen Datenbank (Punkt 17). */
async function claimPractice(
  sql: Sql,
  practiceId: string,
  pms: string,
  owner: string,
  leaseUntil: Date,
): Promise<boolean> {
  const rows = await sql<{ ok: boolean }>`
    select try_claim_pms_sync(
      ${practiceId}, ${pms}, ${owner}, ${new Date()}, ${leaseUntil}
    ) as ok
  `;
  return rows[0]?.ok === true;
}

async function releasePractice(sql: Sql, practiceId: string, pms: string, owner: string): Promise<void> {
  try {
    await sql`
      select release_pms_sync(${practiceId}, ${pms}, ${owner}) as ok
    `;
  } catch {
    // Die Frist laeuft ohnehin ab; ein Fehler hier darf nichts abbrechen.
  }
}

/**
 * Punkt 3 — verfolgt Arbeit, die nach einer Zeitgrenze im Hintergrund
 * weiterlaeuft.
 *
 * `stop()` wartete nur auf den verwalteten Durchgang. Nach einer Zeitgrenze
 * laufen dessen Datenbankarbeiten aber weiter, und beim Herunterfahren konnte
 * der Prozess sie mitten im Schreiben beenden.
 *
 * Ehrliche Grenze: `drain` wartet NICHT unbegrenzt. Haengt eine Verbindung
 * dauerhaft, wuerde ein unbegrenztes Warten das Herunterfahren blockieren —
 * derselbe Fehler wie zuvor, nur an anderer Stelle.
 */
export type BackgroundTracker = {
  track(work: Promise<void>): void;
  /** Wartet bis zu `maxWaitMs` auf die verfolgten Arbeiten. `true` = alles fertig. */
  drain(maxWaitMs?: number): Promise<boolean>;
  /** Anzahl der noch laufenden Arbeiten (fuer Tests und Protokoll). */
  pending(): number;
};

/** Wartezeit beim Herunterfahren, bevor aufgegeben wird. */
export const BACKGROUND_DRAIN_MS = 30_000;

export function createBackgroundTracker(): BackgroundTracker {
  const pending = new Set<Promise<void>>();
  return {
    track(work) {
      const entry = work
        .then(
          () => undefined,
          () => undefined,
        )
        .finally(() => {
          pending.delete(entry);
        });
      pending.add(entry);
    },
    async drain(maxWaitMs = BACKGROUND_DRAIN_MS) {
      if (pending.size === 0) return true;
      const all = (async () => {
        // Schleife, weil waehrend des Wartens weitere Arbeit hinzukommen kann.
        while (pending.size > 0) {
          await Promise.all([...pending]);
        }
      })();
      if (!Number.isFinite(maxWaitMs) || maxWaitMs <= 0) {
        await all;
        return true;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          all.then(() => true),
          new Promise<boolean>((resolve) => {
            timer = setTimeout(() => resolve(false), maxWaitMs);
            // Nicht `unref()` (siehe withTimeout): die begrenzte Wartezeit muss
            // auch dann feuern, wenn sie der einzige offene Handle ist.
          }),
        ]);
        return result;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    pending() {
      return pending.size;
    },
  };
}

/** Reservierung freigeben, sobald die Hintergrundarbeit endet — egal wie. */
function releaseWhenDone(
  work: Promise<void>,
  sql: Sql,
  row: { id: string; pms: string },
  owner: string,
): Promise<void> {
  const done = () => releasePractice(sql, row.id, row.pms, owner);
  return work.then(done, done);
}

async function syncOnePractice(
  sql: Sql,
  row: { id: string; pms: string },
  log: (msg: string) => void,
  syncFor: (sql: Sql, practiceId: string, pms: string) => { engine: SyncEngine; repo?: BridgeRepo; scope?: Scope },
  owner: string,
  timeoutMs: number,
  leaseMs: number,
  background: BackgroundTracker,
): Promise<void> {
  const shortId = row.id.slice(0, 8);

  // Punkt 17: laeuft schon ein anderer Server fuer diese Praxis, wird sie
  // uebersprungen statt doppelt abgeglichen.
  let claimed = false;
  try {
    claimed = await claimPractice(sql, row.id, row.pms, owner, new Date(Date.now() + leaseMs));
  } catch {
    // Ohne Reservierung (z. B. fehlende Migration) wird nicht gearbeitet —
    // lieber ueberspringen als unkoordiniert doppelt senden.
    log(`[pms-sync] Praxis ${shortId}...: Reservierung nicht moeglich, uebersprungen`);
    return;
  }
  if (!claimed) {
    log(`[pms-sync] Praxis ${shortId}...: anderer Server arbeitet, uebersprungen`);
    return;
  }

  let work: Promise<void> | null = null;
  try {
    const { engine, repo, scope } = syncFor(sql, row.id, row.pms);
    work = (async () => {
      const master = await engine.syncMasterData();
      const outbox = await engine.flushOutbox();
      log(`[pms-sync] Praxis ${shortId}... Stammdaten ${master.ok ? "ok" : "fehlgeschlagen"}, Outbox ${outbox.ok ? "ok" : "fehlgeschlagen"}`);
      if (repo && scope) {
        // Warnung ohne PII, damit ein Blick ins Log reicht. Aufraeumen: 30 Tage.
        const stats = await repo.stats(scope);
        if (stats.failedOutbox > 0) {
          log(`[pms-sync] Achtung: ${stats.failedOutbox} Buchung(en) endgueltig gescheitert - Statuszeile in den Einstellungen pruefen`);
        }
        await repo.cleanup(scope, new Date(Date.now() - CLEANUP_DAYS * 86_400_000));
      }
    })();

    const raced = await withTimeout(work, timeoutMs);
    if (raced.timedOut) {
      // Punkt 16: nicht auf die haengende Praxis warten.
      log(`[pms-sync] Praxis ${shortId}...: Zeitgrenze erreicht, naechste Praxis`);
      // Punkt 2: Reservierung NICHT jetzt freigeben. Die Arbeit laeuft weiter;
      // eine Freigabe wuerde einem zweiten Server erlauben, dieselbe
      // womoeglich noch laufende Uebertragung zu beginnen. Sie wird erst nach
      // dem Ende dieser Arbeit freigegeben.
      // Punkt 3: und `stop()` wartet ueber den Tracker darauf.
      background.track(releaseWhenDone(work, sql, row, owner));
      return;
    }
  } catch (err) {
    // Kein PII: nur technischer Status, nie Praxis-/Halterdaten.
    log(`[pms-sync] Lauf fehlgeschlagen: ${err instanceof Error ? "Interner Bridge-Fehler" : "Unbekannter Fehler"}`);
  }

  // Nur wenn die Arbeit wirklich beendet ist, wird die Reservierung frei.
  await releasePractice(sql, row.id, row.pms, owner);
}

async function runAllPractices(
  sql: Sql,
  log: (msg: string) => void,
  syncFor: (sql: Sql, practiceId: string, pms: string) => { engine: SyncEngine; repo?: BridgeRepo; scope?: Scope },
  owner: string,
  timeoutMs: number,
  shouldStop: () => boolean,
  background: BackgroundTracker,
): Promise<void> {
  const rows = await sql<{ id: string; pms: string | null }>`select id, pms from practices`;
  const leaseMs = Math.max(timeoutMs * 2, 5 * 60_000);
  for (const row of rows) {
    // Punkt 15: nach `stop()` werden keine weiteren Praxen begonnen.
    if (shouldStop()) return;
    const pms = String(row.pms ?? "").trim();
    if (!pms || !hasPraxissoftwareAdapter(pms)) continue;
    await syncOnePractice(sql, { id: row.id, pms }, log, syncFor, owner, timeoutMs, leaseMs, background);
  }
}

/**
 * `env` und `deps` injizierbar fuer Tests (Fake-Timer, Fake-`getSql`). Default `deps`
 * nutzt echte Timer und die reale DB (lazy `@/lib/db`, siehe Modul-Kommentar in
 * `praxissoftware-runtime.ts` fuer die Begruendung).
 */
export function startBridgeScheduler(
  env: NodeJS.ProcessEnv = process.env,
  deps?: Partial<Deps>,
): BridgeScheduler {
  const minutes = parseSyncMinutes(env);
  if (minutes <= 0) return { stop: async () => undefined };

  const log = deps?.log ?? ((msg: string) => console.error(msg));
  const setIntervalFn = deps?.setInterval ?? setInterval;
  const clearIntervalFn = deps?.clearInterval ?? clearInterval;
  const getSql =
    deps?.getSql ??
    (async () => {
      const { getSql: realGetSql } = await import("@/lib/db.server");
      return realGetSql();
    });
  const syncFor = deps?.syncFor ?? bridgeSyncForWith;
  const timeoutMs = deps?.practiceTimeoutMs ?? practiceSyncTimeoutMs(env);
  /** Kennung dieses Prozesses fuer die Reservierung. */
  const owner = randomUUID();

  let stopped = false;
  /** Punkt 15: das Versprechen des laufenden Durchgangs. */
  let inFlight: Promise<void> | null = null;
  /** Punkt 3: Arbeit, die nach einer Zeitgrenze weiterlaeuft. */
  const background = createBackgroundTracker();

  const tick = (): void => {
    if (stopped || inFlight) return; // Ueberlappenden Lauf ueberspringen.
    inFlight = getSql()
      .then((sql) => runAllPractices(sql, log, syncFor, owner, timeoutMs, () => stopped, background))
      .catch((err) => log(`[pms-sync] Lauf fehlgeschlagen: ${err instanceof Error ? "Interner Bridge-Fehler" : "Unbekannter Fehler"}`))
      .finally(() => {
        inFlight = null;
      });
  };

  const id = setIntervalFn(tick, minutes * 60_000);
  (id as { unref?: () => void })?.unref?.();
  log(`[pms-sync] Hintergrund-Sync aktiv, alle ${minutes} min`);

  // Punkt 14: sofort einmal arbeiten. Vorher wartete der erste Lauf ein
  // komplettes Intervall — bei 60 Minuten hiess das eine Stunde ohne Abgleich.
  if (deps?.runOnStart !== false) tick();

  return {
    async stop() {
      stopped = true;
      clearIntervalFn(id);
      // Punkt 15: den laufenden Durchgang abwarten, nicht nur den Timer entfernen.
      const running = inFlight;
      if (running) await running;
      // Punkt 3: und die Arbeit, die nach einer Zeitgrenze weiterlaeuft.
      // Begrenzt, damit eine haengende Verbindung das Herunterfahren nicht
      // blockiert — genau der Fehler, der hier behoben wird.
      const drained = await background.drain(deps?.stopDrainMs);
      if (!drained) {
        log(`[pms-sync] Herunterfahren: ${background.pending()} Hintergrundarbeit laeuft noch`);
      }
    },
  };
}
