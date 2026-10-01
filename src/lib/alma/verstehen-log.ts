/**
 * Trainingskorpus aus echten Anrufen (Owner-Wunsch): jede Antwort, die Silvia
 * lokal nur mit dem generischen Fallback oder "nicht verstanden" beantwortet
 * hat, landet hier – Rohmaterial, um verstehen.corpus.ts, verstehen.ts und
 * localReply (ask-alma.ts) mit echten Formulierungen zu erweitern.
 *
 * Server-only: node:fs, nie vom Client importieren. Wird aus ask-alma.ts
 * heraus per dynamic import() aufgerufen, damit dieses Modul nicht ins
 * Client-Bundle gelangt.
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePgliteDataDir } from "../pglite-data-dir.ts";
import { GENERIC_FALLBACK_MARKER, UNCLEAR_REPLY_TEXT } from "./verstehen.ts";

export type VerstehenLogEntry = {
  ts: string;
  sagt: string;
  antwort: string;
  quelle: "local" | "llm";
  identified: boolean;
};

/** Silvia hat nichts Konkretes erkannt: generischer Fallback oder "nicht verstanden". */
export function isWeakReply(text: string): boolean {
  const t = String(text ?? "");
  if (!t) return false;
  return t.includes(GENERIC_FALLBACK_MARKER) || t.includes(UNCLEAR_REPLY_TEXT);
}

type DataDirEnv = { SILVIA_DATA_DIR?: string };
export const MEMORY_VERSTEHEN_LOG = "memory://silvia-verstehen-log";
const memoryEntries: VerstehenLogEntry[] = [];

/** Gleiche Konvention wie resolvePgliteDataDir (pglite-data-dir.ts): SILVIA_DATA_DIR oder .silvia-data. */
export function verstehenLogPath(env: DataDirEnv = process.env): string {
  if (resolvePgliteDataDir(env) === undefined) return MEMORY_VERSTEHEN_LOG;
  const dir = (env.SILVIA_DATA_DIR?.trim() || ".silvia-data").replace(
    /[/\\]+$/,
    "",
  );
  return `${dir}/verstehen-log.jsonl`;
}

/** Datei nie über diese Zeilenzahl wachsen lassen – neue Zeilen darüber werden verworfen. */
export const VERSTEHEN_LOG_CAP = 2000;

function countEntries(raw: string): number {
  return raw.split("\n").filter((line) => line.trim().length > 0).length;
}

/** Eine Zeile anhängen. Legt den Ordner bei Bedarf an. Wirft nie – Fehler werden verschluckt und gewarnt. */
export async function appendVerstehenLog(
  entry: VerstehenLogEntry,
  path: string,
): Promise<void> {
  if (path === MEMORY_VERSTEHEN_LOG) {
    if (memoryEntries.length < VERSTEHEN_LOG_CAP) memoryEntries.push({ ...entry });
    return;
  }
  try {
    let existing = "";
    try {
      existing = await readFile(path, "utf8");
    } catch {
      existing = "";
    }
    if (countEntries(existing) >= VERSTEHEN_LOG_CAP) {
      console.warn(
        `[verstehen-log] ${VERSTEHEN_LOG_CAP} Einträge erreicht, neue Zeile verworfen: ${path}`,
      );
      return;
    }
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (err) {
    console.warn(
      `[verstehen-log] Anhängen fehlgeschlagen, Zeile verworfen: ${path}`,
      err,
    );
  }
}

/** Alle Zeilen lesen, kaputte Zeilen überspringen. Fehlende Datei -> leeres Array. */
export async function readVerstehenLog(
  path: string,
): Promise<VerstehenLogEntry[]> {
  if (path === MEMORY_VERSTEHEN_LOG) return memoryEntries.map(entry => ({ ...entry }));
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return [];
  }
  const out: VerstehenLogEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as VerstehenLogEntry);
    } catch {
      /* kaputte Zeile überspringen */
    }
  }
  return out;
}
