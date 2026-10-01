/**
 * AP 57: Hoer-Check im Trainingsmodus. Silvia schreibt im Training zuerst mit,
 * was sie gehoert hat; der Operator bestaetigt oder korrigiert. Abweichende
 * Korrekturen landen hier — Rohmaterial fuer llmStt (STT_FACH_PROMPT), damit
 * korrigierte Woerter zu Vokabular-Hinweisen fuer die naechste Erkennung werden.
 *
 * Server-only: node:fs, nie vom Client importieren (siehe verstehen-log.ts,
 * gleiches Muster).
 */
import { appendFile, mkdir, open, readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { resolvePgliteDataDir } from "../pglite-data-dir.ts";
import { HOER_LOG_CAP, isMeaningfulCorrection } from "./hoer-log-shared.ts";
export { HOER_LOG_CAP, isMeaningfulCorrection } from "./hoer-log-shared.ts";

export type HoerKorrekturEntry = {
  ts: string;
  heard: string;
  corrected: string;
  practiceId?: string;
  requestId?: string;
};

type HoerSql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

/**
 * Sprachkorrekturen sind Praxiswissen: Nur Korrekturen derselben Ordination
 * dürfen als Hinweis an die nächste Transkription gehen. Ohne Praxis gibt es
 * bewusst keine Übernahme aus einer anderen Demo oder Ordination.
 */
export function correctedPhrasesForPractice(
  entries: readonly HoerKorrekturEntry[],
  practiceId?: string,
): string[] {
  if (!practiceId) return [];
  return entries
    .filter((entry) => entry.practiceId === practiceId)
    .map((entry) => entry.corrected);
}

type DataDirEnv = { SILVIA_DATA_DIR?: string };

/** Kein Dateipfad: Der RAM-Modus darf keine Sprachkorrekturen auf die Platte schreiben. */
export const MEMORY_HOER_LOG = "memory://silvia-hoer-korrekturen";
const memoryHoerLogs = new Map<string, HoerKorrekturEntry[]>();

function isMemoryHoerLog(path: string): boolean {
  return path === MEMORY_HOER_LOG;
}

/** Gleiche Konvention wie verstehenLogPath: SILVIA_DATA_DIR oder .silvia-data. */
export function hoerLogPath(env: DataDirEnv = process.env): string {
  if (resolvePgliteDataDir(env) === undefined) return MEMORY_HOER_LOG;
  const dir = (env.SILVIA_DATA_DIR?.trim() || ".silvia-data").replace(
    /[/\\]+$/,
    "",
  );
  return `${dir}/silvia-hoer-korrekturen.jsonl`;
}

/** Datei nie über diese Zeilenzahl wachsen lassen – neue Zeilen darüber werden verworfen. */
export const LEGACY_HOER_MAX_BYTES = 2 * 1024 * 1024;

function countEntries(raw: string): number {
  return raw.split("\n").filter((line) => line.trim().length > 0).length;
}

/** Eine Zeile anhängen. Legt den Ordner bei Bedarf an, wirft nie und meldet den Erfolg zurück. */
export async function appendHoerKorrektur(
  entry: HoerKorrekturEntry,
  path: string,
): Promise<boolean> {
  try {
    if (isMemoryHoerLog(path)) {
      const entries = memoryHoerLogs.get(path) ?? [];
      if (entries.length >= HOER_LOG_CAP) return false;
      entries.push(entry);
      memoryHoerLogs.set(path, entries);
      return true;
    }
    let existing = "";
    try {
      existing = await readFile(path, "utf8");
    } catch {
      existing = "";
    }
    if (countEntries(existing) >= HOER_LOG_CAP) {
      console.warn(
        `[hoer-log] ${HOER_LOG_CAP} Einträge erreicht, neue Zeile verworfen: ${path}`,
      );
      return false;
    }
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(entry)}\n`, "utf8");
    return true;
  } catch (err) {
    console.warn(
      `[hoer-log] Anhängen fehlgeschlagen, Zeile verworfen: ${path}`,
      err,
    );
    return false;
  }
}

/** Alle Zeilen lesen, kaputte Zeilen überspringen. Fehlende Datei -> leeres Array. */
export async function readHoerLog(path: string): Promise<HoerKorrekturEntry[]> {
  if (isMemoryHoerLog(path)) return [...(memoryHoerLogs.get(path) ?? [])];
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return [];
  }
  const out: HoerKorrekturEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as HoerKorrekturEntry);
    } catch {
      /* kaputte Zeile überspringen */
    }
  }
  return out;
}

function validLegacyEntry(value: unknown): HoerKorrekturEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const ts = String(row.ts ?? "").trim();
  const heard = String(row.heard ?? "").trim().slice(0, 40);
  const corrected = String(row.corrected ?? "").trim().slice(0, 40);
  const practiceId = String(row.practiceId ?? "").trim().slice(0, 180);
  if (!ts || Number.isNaN(Date.parse(ts)) || !practiceId || !isMeaningfulCorrection(heard, corrected)) {
    return null;
  }
  return { ts: new Date(ts).toISOString(), heard, corrected, practiceId };
}

async function readLegacyHoerLogStrict(path: string): Promise<HoerKorrekturEntry[]> {
  if (isMemoryHoerLog(path)) return [...(memoryHoerLogs.get(path) ?? [])];
  let raw: string;
  try {
    const file = await open(path, "r");
    try {
      // Read at most limit+1 even if the file grows after opening.
      const buffer = Buffer.alloc(LEGACY_HOER_MAX_BYTES + 1);
      let total = 0;
      while (total < buffer.length) {
        const { bytesRead } = await file.read(buffer, total, buffer.length - total, null);
        if (!bytesRead) break;
        total += bytesRead;
      }
      if (total > LEGACY_HOER_MAX_BYTES) throw new Error("Sprachkorrektur-Import ist größer als 2 MiB. Quelldatei unverändert.");
      raw = buffer.subarray(0, total).toString("utf8");
    } finally {
      await file.close();
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const entries: HoerKorrekturEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = validLegacyEntry(JSON.parse(trimmed));
      if (entry) entries.push(entry);
    } catch {
      /* malformed legacy data is deliberately not assigned to any practice */
    }
  }
  return entries;
}

function legacyKey(entry: HoerKorrekturEntry, ordinal: number) {
  return `jsonl:${createHash("sha256")
    .update(`${ordinal}\n${entry.ts}\n${entry.practiceId}\n${entry.heard}\n${entry.corrected}`)
    .digest("hex")}`;
}

/**
 * Copy valid, explicitly tenant-bound legacy JSONL rows into PGLite. The source
 * file is never changed. `legacy_key` makes repeated startup/backup imports
 * idempotent, and an unknown practice is never guessed or reassigned.
 */
export async function importLegacyHoerKorrekturen(sql: HoerSql, path = hoerLogPath()) {
  // This completion marker is separate from individual corrections. A later
  // intentional deletion must never be resurrected from the preserved JSONL.
  const sourceKey = "silvia-hoer-korrekturen.jsonl:v1";
  const entries = await readLegacyHoerLogStrict(path);
  const payload = entries.map((entry, ordinal) => ({
    id: randomUUID(),
    ordinal,
    ts: entry.ts,
    heard: entry.heard,
    corrected: entry.corrected,
    practiceId: entry.practiceId,
    legacyKey: legacyKey(entry, ordinal),
  }));
  // One atomic function: marker claim and per-practice row locks serialize
  // imports with normal corrections. Overflow rolls the entire claim back.
  const rows = await sql.query<{ count: number }>(
    `select import_hoer_legacy_atomic($1, $2, $3::jsonb) as count`,
    [sourceKey, new Date().toISOString(), JSON.stringify(payload)],
  );
  return rows[0]?.count ?? 0;
}

export async function saveHoerKorrektur(
  sql: HoerSql,
  entry: Omit<Required<HoerKorrekturEntry>, "requestId"> & { requestId?: string },
): Promise<boolean> {
  const requestId = entry.requestId?.trim() || null;
  const rows = await sql.query<{ ok: boolean }>(
    `select save_hoer_korrektur_atomic($1, $2, $3, $4, $5, $6) as ok`,
    [randomUUID(), entry.practiceId, entry.heard, entry.corrected, entry.ts, requestId],
  );
  return rows[0]?.ok === true;
}

export async function correctedPhrasesFromDb(sql: HoerSql, practiceId?: string): Promise<string[]> {
  if (!practiceId) return [];
  const rows = await sql.query<{ corrected: string }>(
    `select corrected from hoer_corrections
     where practice_id = $1
     order by created_at asc, id asc
     limit $2`,
    [practiceId, HOER_LOG_CAP],
  );
  return rows.map((row) => row.corrected);
}
