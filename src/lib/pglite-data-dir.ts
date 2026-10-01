import { isAbsolute, join } from "node:path";

/** Folder next to `package.json` when `SILVIA_DATA_DIR` is unset. */
export const DEFAULT_PGLITE_DIR_NAME = ".silvia-data";

const MEMORY_VALUES = new Set(["memory", "memory://", ":memory:"]);

type DataDirEnv = {
  SILVIA_DATA_DIR?: string;
};

/**
 * Where PGLite stores the Ordination when `DATABASE_URL` is unset.
 *
 * - unset → `<cwd>/.silvia-data` (survives `npm start` / `npm run dev` restart)
 * - `memory` / `memory://` / `:memory:` → RAM only (wiped on process exit)
 * - any other path → that directory (`cwd`-relative when not absolute)
 */
export function resolvePgliteDataDir(
  env: DataDirEnv = process.env,
  cwd = typeof process !== "undefined" ? process.cwd() : ".",
): string | undefined {
  const raw = env.SILVIA_DATA_DIR?.trim();
  if (raw && MEMORY_VALUES.has(raw.toLowerCase())) return undefined;
  const dir = raw || DEFAULT_PGLITE_DIR_NAME;
  return isAbsolute(dir) ? dir : join(cwd, dir);
}

type BackupDirEnv = DataDirEnv & {
  SILVIA_BACKUP_DIR?: string;
};

/**
 * Zielordner für die zweite, redundante Speicherkopie der verschlüsselten
 * Tafel-Sicherung (Runde 10 Punkt 19).
 *
 * - `SILVIA_BACKUP_DIR` gesetzt → dieser Ordner (`cwd`-relativ, wenn nicht
 *   absolut), damit die Praxis auf eine zweite Platte/Netzfreigabe zeigen kann.
 * - sonst, mit echtem Datenordner → `${dataDir}.backup` als Nachbarordner —
 *   niemals im Datenordner selbst, sonst sichert der nächste Export die Kopie
 *   wieder mit.
 * - RAM-Modus ohne Override → `undefined` (keine Ablage möglich).
 */
export function resolvePgliteBackupDir(
  env: BackupDirEnv = process.env,
  cwd = typeof process !== "undefined" ? process.cwd() : ".",
  dataDir = resolvePgliteDataDir(env, cwd),
): string | undefined {
  const raw = env.SILVIA_BACKUP_DIR?.trim();
  if (raw && MEMORY_VALUES.has(raw.toLowerCase())) return undefined;
  if (raw) return isAbsolute(raw) ? raw : join(cwd, raw);
  if (!dataDir) return undefined;
  return `${dataDir}.backup`;
}
