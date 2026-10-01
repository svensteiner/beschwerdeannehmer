import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LAST_TAFEL_BACKUP_FILE, parseLastTafelBackup } from "./practice/desk-storage.ts";

export function lastTafelBackupPath(dataDir: string) {
  return join(String(dataDir ?? "").trim(), LAST_TAFEL_BACKUP_FILE);
}

export function readLastTafelBackupFile(dataDir?: string | null) {
  const dir = String(dataDir ?? "").trim();
  if (!dir) return null;
  try {
    return parseLastTafelBackup(readFileSync(lastTafelBackupPath(dir), "utf8"));
  } catch {
    return null;
  }
}

export function writeLastTafelBackupFile(dataDir?: string | null, at: Date | string = new Date()) {
  const dir = String(dataDir ?? "").trim();
  if (!dir || !existsSync(dir)) return "";
  const iso = typeof at === "string" ? (parseLastTafelBackup(at) ?? new Date().toISOString()) : at.toISOString();
  writeFileSync(lastTafelBackupPath(dir), `${iso}\n`);
  return iso;
}

export function clearLastTafelBackupFile(dataDir?: string | null) {
  const dir = String(dataDir ?? "").trim();
  if (!dir) return;
  try {
    unlinkSync(lastTafelBackupPath(dir));
  } catch {
    /* already gone */
  }
}

/** Write the sidecar before dumpDataDir so a gzip that copies the folder keeps the stamp. */
export function markTafelBackupBeforeDump(dataDir?: string | null, at: Date | string = new Date()) {
  const previous = readLastTafelBackupFile(dataDir);
  const iso = writeLastTafelBackupFile(dataDir, at);
  return { previous, iso };
}

export function rollbackTafelBackupStamp(dataDir?: string | null, previous?: string | null) {
  if (previous) writeLastTafelBackupFile(dataDir, previous);
  else clearLastTafelBackupFile(dataDir);
}
