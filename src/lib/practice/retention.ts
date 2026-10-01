import type { Sql } from "@/lib/db";

/**
 * DSGVO-Löschroutine (AP 14): Anrufe (inkl. Transkript), interne/Klientel-Protokolle
 * (Threads) und Mails älter als die pro Ordination hinterlegte Aufbewahrung
 * (`practices.retention_days`, Default 90, siehe settings-form.ts). Patienten/Halter
 * (Kartei) und Termine bleiben unangetastet — auch vergangene, damit die Historie am
 * Termin erhalten bleibt. Nur Server-Kontext (startet den Prozess und läuft alle 24 h,
 * siehe db.ts); live Trading-/Gesprächscode liest diese Datei nie mit.
 */
export type PurgeResult = {
  practices: number;
  /** Ordinationen, deren Bereinigung fehlschlug. Die übrigen liefen weiter. */
  failed: number;
  calls: number;
  threads: number;
  mails: number;
};

/**
 * Portionsgröße je Lösch-Anweisung.
 *
 * Früher lud eine einzige `delete … returning id` sämtliche betroffenen
 * Kennungen auf einmal: bei großen Mengen kostete das viel Speicher und hielt
 * eine lange Datenbanksperre. Jetzt wird in kleinen Portionen gelöscht, bis
 * nichts mehr übrig ist.
 */
export const PURGE_BATCH_SIZE = 500;

/**
 * Neutrale Fehlerkennung ohne Fehlerobjekt.
 *
 * Ein Datenbankfehler kann die fehlerhafte Anweisung und damit Nutzdaten
 * enthalten. Ins Protokoll kommt deshalb nur eine Klasse plus Fehlername.
 */
function logPurgeFailure(code: string, err: unknown): void {
  const name = err instanceof Error && err.name ? err.name : "Error";
  console.error(`[retention] ${code} (${name})`);
}

/**
 * Löscht abgelaufene Zeilen einer Tabelle in Portionen und liefert die Anzahl.
 *
 * `timeColumn` ist eine feste Angabe aus den Aufrufstellen, keine Eingabe.
 *
 * Für Verläufe zählt die LETZTE Änderung (`updated_at`), nicht die Anlage: ein
 * langer Verlauf mit einer neuen Nachricht darf nicht verschwinden (Punkt 19).
 */
async function deleteInBatches(
  sql: Sql,
  table: "calls" | "threads" | "mails",
  timeColumn: "at" | "created_at" | "updated_at",
  practiceId: string,
  cutoff: string,
  batchSize = PURGE_BATCH_SIZE,
): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await sql.query<{ id: string }>(
      `with batch as (
         select id from ${table}
          where practice_id = $1 and ${timeColumn} < $2
          limit $3
       )
       delete from ${table} using batch
        where ${table}.id = batch.id
        returning ${table}.id`,
      [practiceId, cutoff, batchSize],
    );
    total += rows.length;
    if (rows.length < batchSize) return total;
  }
}

/**
 * Verläufe löschen — mit Rückfall auf `created_at`.
 *
 * Punkt 19 haengt an der Spalte `updated_at` (Migration 0032). Eine aeltere
 * Datenbank, die noch nicht migriert wurde, kennt sie nicht; dann wuerde jeder
 * Versuch scheitern und der gesamte Lauf als „fehlgeschlagen“ gelten. Mit dem
 * Rueckfall bleibt die Bereinigung wenigstens wirksam, und der Fehlschlag ist
 * nur ein Nachteil beim Verlaufsschutz statt ein Totalausfall.
 */
async function deleteThreadsWithFallback(
  sql: Sql,
  practiceId: string,
  cutoff: string,
): Promise<number> {
  try {
    return await deleteInBatches(sql, "threads", "updated_at", practiceId, cutoff);
  } catch {
    console.error("[retention] threads.updated_at fehlt, Rueckfall auf created_at");
    return await deleteInBatches(sql, "threads", "created_at", practiceId, cutoff);
  }
}

export async function purgeExpired(sql: Sql, now = new Date()): Promise<PurgeResult> {  const practices = await sql<{ id: string; retention_days: number }>`
    select id, retention_days from practices
  `;
  let calls = 0;
  let threads = 0;
  let mails = 0;
  let failed = 0;
  for (const practice of practices) {
    const days = Number(practice.retention_days) || 90;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    try {
      calls += await deleteInBatches(sql, "calls", "at", practice.id, cutoff);
      // Punkt 19: Verlaeufe zaehlen ab der letzten Aenderung. Ein Verlauf, der
      // gestern ergaenzt wurde, bleibt damit erhalten, auch wenn er alt ist.
      // Aeltere Datenbanken ohne die Spalte fallen auf created_at zurueck.
      threads += await deleteThreadsWithFallback(sql, practice.id, cutoff);
      mails += await deleteInBatches(sql, "mails", "at", practice.id, cutoff);
    } catch (err) {
      // Eine Ordination darf die Bereinigung der anderen nicht verhindern.
      failed += 1;
      logPurgeFailure("Bereinigung einer Ordination fehlgeschlagen", err);
    }
  }
  return { practices: practices.length, failed, calls, threads, mails };
}

/** Server-Startup + alle 24 h. Zählt nur — kein PII (kein Name, keine Nummer, kein Transkript) im Log. */
export async function purgeExpiredAndLog(sql: Sql, now = new Date()): Promise<PurgeResult> {
  const result = await purgeExpired(sql, now);
  const failed = result.failed > 0 ? `, ${result.failed} Ordinationen fehlgeschlagen` : "";
  console.info(
    `[retention] gelöscht: ${result.calls} Anrufe, ${result.threads} Protokolle, ${result.mails} Mails (${result.practices} Ordinationen geprüft${failed})`,
  );
  return result;
}

export const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

const globalRef = globalThis as typeof globalThis & {
  __silviaRetentionStarted__?: boolean;
};

export type RetentionHandle = {
  /**
   * Punkt 18: beendet den Timer und wartet den laufenden Löschlauf ab.
   *
   * Vorher startete der Timer unabhaengig davon, ob der vorige Lauf noch
   * arbeitete. Ein zweiter Durchgang griff dann in dieselben Portionen und
   * verlaengerte Sperren und Laufzeit gegenseitig.
   */
  stop(): Promise<void>;
};

/** Injizierbar, damit die Ueberlappungssperre ohne echte Timer pruefbar ist. */
export type RetentionDeps = {
  setInterval: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (id: ReturnType<typeof setInterval>) => void;
};

/**
 * Der eigentliche Lauf — ohne die Prozess-Sperre von `startRetentionSchedule`.
 *
 * Getrennt, damit Tests mehrere Instanzen nebeneinander pruefen koennen; die
 * Sperre „einmal pro Prozess“ bleibt in `startRetentionSchedule`.
 */
export function createRetentionRunner(
  getSql: () => Promise<Sql>,
  deps?: Partial<RetentionDeps>,
): RetentionHandle {
  const setIntervalFn = deps?.setInterval ?? setInterval;
  const clearIntervalFn = deps?.clearInterval ?? clearInterval;

  let stopped = false;
  /** Der laufende Durchgang; ein zweiter wird nicht begonnen (Punkt 18). */
  let inFlight: Promise<void> | null = null;

  const run = (): void => {
    if (stopped || inFlight) return;
    inFlight = getSql()
      .then((sql) => purgeExpiredAndLog(sql))
      .then(() => undefined)
      .catch((err) => logPurgeFailure("Löschroutine fehlgeschlagen", err))
      .finally(() => {
        inFlight = null;
      });
  };

  run();
  const timer = setIntervalFn(run, RETENTION_INTERVAL_MS);
  (timer as { unref?: () => void })?.unref?.();

  return {
    async stop() {
      stopped = true;
      clearIntervalFn(timer);
      const running = inFlight;
      if (running) await running;
    },
  };
}

/**
 * Startet die Löschroutine einmal pro Prozess: sofort, dann alle 24 h. Server-only —
 * niemals aus Client- oder Live-Gesprächscode importieren.
 */
export function startRetentionSchedule(
  getSql: () => Promise<Sql>,
  deps?: Partial<RetentionDeps>,
): RetentionHandle {
  if (globalRef.__silviaRetentionStarted__) return { stop: async () => undefined };
  globalRef.__silviaRetentionStarted__ = true;
  return createRetentionRunner(getSql, deps);
}
