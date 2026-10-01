import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isCopyGatePath } from "./pglite-copy-gate.ts";
import { TAFEL_ANZEIGE_ERROR } from "./practice/tafel-anzeige.ts";

export {
  TAFEL_ANZEIGE_BANNER,
  TAFEL_ANZEIGE_ERROR,
  TAFEL_ANZEIGE_REFRESH_LABEL,
  TAFEL_ANZEIGE_REFRESH_WRITER_ERROR,
  anzeigeControl,
} from "./practice/tafel-anzeige.ts";

/** Same name as `PGLITE_LOCK_FILE` — keep the write lock on the other process. */
const LOCK_FILE = "silvia.lock";

export const ANZEIGE_COPY_ATTEMPTS = 3;

const globalRef = globalThis as typeof globalThis & {
  __pgliteAnzeige__?: boolean;
  __pgliteAnzeigeLiveDir__?: string;
};

export function isTafelAnzeige() {
  return Boolean(globalRef.__pgliteAnzeige__);
}

export function setTafelAnzeige(on: boolean) {
  globalRef.__pgliteAnzeige__ = Boolean(on);
}

export function pgliteAnzeigeDir(pid = process.pid) {
  return join(tmpdir(), `silvia-anzeige-${pid}`);
}

export function currentAnzeigeDir(pid = process.pid) {
  return globalRef.__pgliteAnzeigeLiveDir__ || pgliteAnzeigeDir(pid);
}

export function setCurrentAnzeigeDir(dir: string) {
  globalRef.__pgliteAnzeigeLiveDir__ = String(dir ?? "").trim() || undefined;
}

/** Ping-pong folder so a torn copy never overwrites the live Anzeige dir. */
export function anzeigeAltDir(live: string) {
  const trimmed = String(live ?? "").replace(/\/$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("-b") ? trimmed.slice(0, -2) : `${trimmed}-b`;
}

export function pgliteSnapshotReady(dir: string) {
  const root = String(dir ?? "").trim();
  if (!root || !existsSync(root)) return false;
  return existsSync(join(root, "PG_VERSION")) && existsSync(join(root, "base"));
}

export function isPgliteLockPath(path: string) {
  const name = String(path ?? "").split(/[\\/]/).pop() ?? "";
  return name === LOCK_FILE;
}

/** Copy the writer's PGLite folder. Skip silvia.lock so this process never holds the write lock. */
export function snapshotPgliteDataDir(src: string, dest: string) {
  const from = String(src ?? "").trim();
  const to = String(dest ?? "").trim();
  if (!from || !to || from === to) {
    throw new Error("Tafel-Kopie braucht zwei verschiedene Ordner.");
  }
  if (!existsSync(from)) {
    throw new Error("Die Tafel-Datei liegt nicht auf diesem Rechner.");
  }
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  cpSync(from, to, {
    recursive: true,
    filter: (path) => !isPgliteLockPath(path) && !isCopyGatePath(path),
  });
  return to;
}

function sqlBody(text: string) {
  return String(text ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/** SELECT / WITH…SELECT stay; INSERT/UPDATE and schema changes do not. */
export function sqlIsReadOnly(text: string) {
  const raw = String(text ?? "").trim();
  if (!raw) return true;
  const body = sqlBody(raw);
  // This SELECT invokes a PL/pgSQL function that writes practice_facts.
  // Keep it behind the writer copy-gate and disallow it on the display copy.
  if (/\bremember_practice_fact_atomic\s*\(/i.test(body)) return false;
  if (/\breplace_practice_fact_atomic\s*\(/i.test(body)) return false;
  if (/\breplace_practice_fact_guarded\s*\(/i.test(body)) return false;
  if (/\bsave_hoer_korrektur_atomic\s*\(/i.test(body)) return false;
  if (/\b(insert|update|delete|create|alter|drop|truncate|copy|grant)\b/i.test(body)) return false;
  return /^\s*(select|with|values)\b/i.test(body);
}

const BOARD_WRITE_TABLES =
  /\b(appointments|patients|calls|threads|mails|emergencies|practices|practice_users|practice_facts|praxissoftware_spiegel|_migrations)\b/i;

/** Login cookie on Anzeige — never a Termin or Einstellungen write. */
export function sqlIsSessionWrite(text: string) {
  const body = sqlBody(text);
  if (!/\bpractice_sessions\b/i.test(body)) return false;
  if (BOARD_WRITE_TABLES.test(body)) return false;
  return /\b(insert|update|delete)\b/i.test(body);
}

export function sqlIsAnzeigeAllowed(text: string) {
  return sqlIsReadOnly(text) || sqlIsSessionWrite(text);
}

export function assertTafelWritable() {
  if (isTafelAnzeige()) throw new Error(TAFEL_ANZEIGE_ERROR);
}

export function tafelWriteBlock() {
  if (!isTafelAnzeige()) return null;
  return { error: TAFEL_ANZEIGE_ERROR };
}

export function isTafelAnzeigeError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.startsWith("Nur Anzeige.");
}

export function wantsForcedAnzeige(env: { SILVIA_ANZEIGE?: string } = process.env) {
  const raw = String(env.SILVIA_ANZEIGE ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "anzeige";
}
