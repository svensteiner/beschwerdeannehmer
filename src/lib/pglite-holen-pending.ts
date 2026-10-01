import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseLastTafelBackup } from "./practice/desk-storage.ts";

/** Next to the Tafel folder — survives `rename(dataDir, dataDir.prev)`. */
export function pendingHolenDir(dataDir: string) {
  return `${String(dataDir ?? "").replace(/\/$/, "")}.pending-holen`;
}

/** The committed pending pair lives inside one atomically-renamed directory. */
export function pendingHolenDumpPath(dataDir: string) {
  return join(pendingHolenDir(dataDir), "dump.tar.gz");
}

export function pendingHolenMetaPath(dataDir: string) {
  return join(pendingHolenDir(dataDir), "meta.json");
}

/** Pre-atomic releases stored the pair as neighbouring files; consume but never overwrite it. */
function legacyPendingHolenDumpPath(dataDir: string) {
  return `${String(dataDir ?? "").replace(/\/$/, "")}.pending-holen.tar.gz`;
}

function legacyPendingHolenMetaPath(dataDir: string) {
  return `${String(dataDir ?? "").replace(/\/$/, "")}.pending-holen.json`;
}

export function holenFailPath(dataDir: string) {
  return `${String(dataDir ?? "").replace(/\/$/, "")}.holen-fail`;
}

/** Next to the Tafel folder — dump Inhaberin email after holen without a session. */
export function holenLoginPath(dataDir: string) {
  return `${String(dataDir ?? "").replace(/\/$/, "")}.holen-login`;
}

export function holenLoginEmailFromOwners(emails: unknown) {
  const unique = [
    ...new Set(
      (Array.isArray(emails) ? emails : [])
        .map((value) => String(value ?? "").trim().toLowerCase())
        .filter((email) => email.includes("@")),
    ),
  ];
  return unique.length === 1 ? unique[0] : null;
}

export function writeHolenLoginEmail(dataDir?: string | null, email?: string | null) {
  const dir = String(dataDir ?? "").trim();
  const value = String(email ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 180);
  if (!dir || !value.includes("@")) return "";
  writeFileSync(holenLoginPath(dir), `${value}\n`);
  return value;
}

/** Writer only — Anzeige must not unlink `.holen-fail` / `.holen-login`. */
export function holenSidecarTakeAllowed(anzeige?: boolean) {
  return !anzeige;
}

/** One-shot: read the dump Inhaberin email, then drop the sidecar. */
export function takeHolenLoginEmail(dataDir?: string | null, anzeige?: boolean) {
  if (!holenSidecarTakeAllowed(anzeige)) return null;
  const dir = String(dataDir ?? "").trim();
  if (!dir) return null;
  try {
    const raw = readFileSync(holenLoginPath(dir), "utf8").trim().toLowerCase().slice(0, 180);
    unlinkSync(holenLoginPath(dir));
    return raw.includes("@") ? raw : null;
  } catch {
    return null;
  }
}

export function takeHolenLoginEmailForDesk(dataDir?: string | null, anzeige?: boolean) {
  return takeHolenLoginEmail(dataDir, anzeige);
}

export const HOLEN_FAIL_LINE = "Die Sicherung ließ sich nicht einspielen. Die bisherige Tafel bleibt.";

export function writeHolenFail(dataDir?: string | null, message = HOLEN_FAIL_LINE) {
  const dir = String(dataDir ?? "").trim();
  if (!dir) return "";
  const line = String(message ?? "").trim() || HOLEN_FAIL_LINE;
  writeFileSync(holenFailPath(dir), `${line.slice(0, 240)}\n`);
  return line;
}

export function clearHolenFail(dataDir?: string | null) {
  const dir = String(dataDir ?? "").trim();
  if (!dir) return;
  try {
    unlinkSync(holenFailPath(dir));
  } catch {
    /* already gone */
  }
}

/** Read the fail line without dropping it — GET peek and the wait page. */
export function peekHolenFail(dataDir?: string | null) {
  const dir = String(dataDir ?? "").trim();
  if (!dir) return null;
  try {
    const line = readFileSync(holenFailPath(dir), "utf8").trim().slice(0, 240);
    return line || HOLEN_FAIL_LINE;
  } catch {
    return null;
  }
}

/** One-shot: read the fail line, then drop the sidecar. */
export function takeHolenFail(dataDir?: string | null, anzeige?: boolean) {
  if (!holenSidecarTakeAllowed(anzeige)) return null;
  const dir = String(dataDir ?? "").trim();
  if (!dir) return null;
  try {
    const line = readFileSync(holenFailPath(dir), "utf8").trim().slice(0, 240);
    unlinkSync(holenFailPath(dir));
    return line || HOLEN_FAIL_LINE;
  } catch {
    return null;
  }
}

export function takeHolenFailForDesk(dataDir?: string | null, anzeige?: boolean) {
  return takeHolenFail(dataDir, anzeige);
}

export type HolenPendingMeta = {
  email: string;
  tokenHash: string;
  at: string;
  filename?: string;
};

export function holenPendingShouldApply(input: { anzeige?: boolean; dataDir?: string | null }) {
  return !input.anzeige && Boolean(String(input.dataDir ?? "").trim());
}

/** Writer waits on apply. Anzeige keeps the copy — do not send Empfang to `/holen-warten`. */
export function holenPendingShouldWait(input: { anzeige?: boolean; open?: boolean }) {
  return !input.anzeige && Boolean(input.open);
}

export function parseHolenPendingMeta(raw: unknown): HolenPendingMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const email = String(rec.email ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 180);
  const tokenHash = String(rec.tokenHash ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-f0-9]/g, "")
    .slice(0, 128);
  const at = parseLastTafelBackup(rec.at) ?? "";
  const filename = String(rec.filename ?? "")
    .trim()
    .slice(0, 240);
  if (!email.includes("@") || tokenHash.length < 32 || !at) return null;
  return filename ? { email, tokenHash, at, filename } : { email, tokenHash, at };
}

export function readPendingHolen(dataDir?: string | null) {
  const dir = String(dataDir ?? "").trim();
  if (!dir) return null;
  const pairs = [
    [pendingHolenDumpPath(dir), pendingHolenMetaPath(dir)],
    [legacyPendingHolenDumpPath(dir), legacyPendingHolenMetaPath(dir)],
  ] as const;
  for (const [dumpPath, metaPath] of pairs) {
    try {
      const bytes = new Uint8Array(readFileSync(dumpPath));
      if (bytes.byteLength < 32) continue;
      const meta = parseHolenPendingMeta(JSON.parse(readFileSync(metaPath, "utf8")));
      if (meta) return { bytes, meta };
    } catch {
      // A pair is only considered ready once both complete files can be read.
    }
  }
  return null;
}

export function writePendingHolen(
  dataDir: string | null | undefined,
  bytes: Uint8Array,
  meta: HolenPendingMeta,
) {
  const dir = String(dataDir ?? "").trim();
  const parsed = parseHolenPendingMeta(meta);
  if (!dir || !parsed || bytes.byteLength < 32) return false;
  const target = pendingHolenDir(dir);
  // A restore is already queued or still being applied. Never replace either
  // half of it; the authorised caller can retry after the visible apply ends.
  if (
    existsSync(target) ||
    existsSync(legacyPendingHolenDumpPath(dir)) ||
    existsSync(legacyPendingHolenMetaPath(dir))
  ) return false;
  const staging = `${target}.staging-${randomUUID()}`;
  try {
    mkdirSync(staging);
    writeFileSync(join(staging, "dump.tar.gz"), bytes, { flag: "wx" });
    writeFileSync(join(staging, "meta.json"), `${JSON.stringify(parsed)}\n`, { flag: "wx" });
    // A directory rename publishes both files as one unit. If another process
    // won the race, this fails without touching its already-pending restore.
    renameSync(staging, target);
    return existsSync(pendingHolenDumpPath(dir)) && existsSync(pendingHolenMetaPath(dir));
  } catch {
    return false;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export function clearPendingHolen(dataDir?: string | null) {
  const dir = String(dataDir ?? "").trim();
  if (!dir) return;
  rmSync(pendingHolenDir(dir), { recursive: true, force: true });
  for (const path of [legacyPendingHolenDumpPath(dir), legacyPendingHolenMetaPath(dir)]) {
    try {
      unlinkSync(path);
    } catch {
      /* already gone */
    }
  }
}

export function hasPendingHolen(dataDir?: string | null) {
  return readPendingHolen(dataDir) !== null;
}

/** Files exist — GET peek must not read the gzip (apply still holds it). */
export function holenPendingIsOpen(dataDir?: string | null) {
  const dir = String(dataDir ?? "").trim();
  if (!dir) return false;
  return (
    (existsSync(pendingHolenDumpPath(dir)) && existsSync(pendingHolenMetaPath(dir))) ||
    (existsSync(legacyPendingHolenDumpPath(dir)) && existsSync(legacyPendingHolenMetaPath(dir)))
  );
}

/**
 * Sidecar first — even without a cookie, so `/app` can redirect to the wait
 * page without `getSql()`. Idle without a cookie stays 401.
 */
export function holenPeekStatus(cookieOn: boolean, dataDir?: string | null, anzeige?: boolean) {
  if (holenPendingShouldWait({ anzeige, open: holenPendingIsOpen(dataDir) })) {
    return { ok: true as const, pending: true, fail: "" };
  }
  const fail = anzeige ? "" : peekHolenFail(dataDir) ?? "";
  if (!cookieOn) return { ok: false as const, error: "Bitte neu anmelden.", status: 401, fail };
  return { ok: true as const, pending: false, fail };
}
