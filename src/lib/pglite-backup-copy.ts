import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolvePgliteBackupDir } from "./pglite-data-dir.ts";

/**
 * Zweite, redundante Speicherkopie der verschlüsselten Tafel-Sicherung
 * (Runde 10 Punkt 19).
 *
 * Die Kopie liegt außerhalb des Datenordners (Standard `<dataDir>.backup`),
 * damit sie beim nächsten Export nicht wieder mitgesichert wird. Sie ist
 * Byte-identisch mit dem Download und best-effort: ein Schreibfehler (volle
 * Platte, fehlende Rechte) darf den eigentlichen Download nicht blockieren.
 */
export function writeTafelBackupCopy(
  dataDir: string | undefined,
  filename: string,
  bytes: Uint8Array,
  env: Parameters<typeof resolvePgliteBackupDir>[0] = process.env,
): string {
  const dir = resolvePgliteBackupDir(env, undefined, dataDir);
  if (!dir) return "";
  try {
    mkdirSync(dir, { recursive: true });
    const target = join(dir, filename);
    writeFileSync(target, bytes);
    return target;
  } catch {
    // Best-effort: die zweite Kopie darf den Download nicht kippen.
    return "";
  }
}
