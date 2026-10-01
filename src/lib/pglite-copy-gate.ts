import { cpSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rmDirRetry, rmDirRetrySync } from "./pglite-fs.ts";

export const COPY_SEQ_FILE = "silvia.copy-seq";
export const COPY_BUSY_FILE = "silvia.copy-busy";

export function isCopyGatePath(path: string) {
  // Split on both slash styles: callers pass real (platform) paths built with
  // `sep`, but tests (and some sidecar names) use posix-style "/" regardless
  // of host OS — a Windows-only `sep` split would leave those as one segment.
  const name = String(path ?? "").split(/[\\/]/).pop() ?? "";
  return name === COPY_SEQ_FILE || name === COPY_BUSY_FILE;
}

export function copySeqPath(dataDir: string) {
  return join(String(dataDir ?? ""), COPY_SEQ_FILE);
}

export function copyBusyPath(dataDir: string) {
  return join(String(dataDir ?? ""), COPY_BUSY_FILE);
}

/** Next to the Tafel folder — survives `rename(dataDir, dataDir.prev)` during Tafel holen. */
export function copyBusySidecarPath(dataDir: string) {
  return `${String(dataDir ?? "").replace(/\/$/, "")}.copy-busy`;
}

/** Tafel sichern holds busy through CHECKPOINT + gzip — 15s copied a torn folder. */
export const COPY_BUSY_WAIT_MS = 120_000;
export const COPY_BUSY_POLL_MS = 100;

export function readCopySeq(dataDir: string) {
  try {
    const raw = readFileSync(copySeqPath(dataDir), "utf8").trim();
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function isCopyBusy(dataDir: string) {
  const dir = String(dataDir ?? "").trim();
  if (!dir) return false;
  return existsSync(copyBusySidecarPath(dir)) || existsSync(copyBusyPath(dir));
}

/** How many withCopyBusy holders are open. Legacy `1` files count as one. */
export function readCopyBusyCount(dataDir: string) {
  const dir = String(dataDir ?? "").trim();
  if (!dir) return 0;
  for (const path of [copyBusySidecarPath(dir), copyBusyPath(dir)]) {
    try {
      const raw = readFileSync(path, "utf8").trim();
      const n = Number(raw);
      if (Number.isInteger(n) && n > 0) return n;
      if (existsSync(path)) return 1;
    } catch {
      /* missing */
    }
  }
  return 0;
}

function writeCopyBusyCount(dataDir: string, n: number) {
  const body = `${n}\n`;
  writeFileSync(copyBusySidecarPath(dataDir), body);
  try {
    if (existsSync(dataDir)) writeFileSync(copyBusyPath(dataDir), body);
  } catch {
    /* folder mid-rename */
  }
}

const busyHoldersRef = globalThis as typeof globalThis & {
  __silviaCopyBusyHolders__?: number;
};

/** In-process withCopyBusy holders — survives HMR of this module. */
export function liveCopyBusyHolders() {
  return Number(busyHoldersRef.__silviaCopyBusyHolders__ ?? 0);
}

function addCopyBusyHolder(delta: number) {
  const next = Math.max(0, liveCopyBusyHolders() + delta);
  busyHoldersRef.__silviaCopyBusyHolders__ = next;
  return next;
}

export function markCopyBusy(dataDir: string) {
  const dir = String(dataDir ?? "").trim();
  if (!dir) return;
  writeCopyBusyCount(dir, readCopyBusyCount(dir) + 1);
}

export function clearCopyBusy(dataDir: string) {
  const dir = String(dataDir ?? "").trim();
  if (!dir) return;
  const next = readCopyBusyCount(dir) - 1;
  if (next <= 0) {
    try {
      unlinkSync(copyBusySidecarPath(dir));
    } catch {
      /* already gone */
    }
    try {
      unlinkSync(copyBusyPath(dir));
    } catch {
      /* already gone */
    }
    return;
  }
  writeCopyBusyCount(dir, next);
}

/** Drop leftover busy files after a crash — only when this process holds none. */
export function recoverStaleCopyBusy(dataDir?: string | null) {
  const dir = String(dataDir ?? "").trim();
  if (!dir) return false;
  if (liveCopyBusyHolders() > 0) return false;
  if (!isCopyBusy(dir)) return false;
  try {
    unlinkSync(copyBusySidecarPath(dir));
  } catch {
    /* already gone */
  }
  try {
    unlinkSync(copyBusyPath(dir));
  } catch {
    /* already gone */
  }
  return !isCopyBusy(dir);
}

/** Anzeige waits here so Tafel holen / Tafel sichern can finish before the copy. */
export async function waitWhileCopyBusy(
  dataDir: string,
  opts?: {
    maxMs?: number;
    pollMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
) {
  const maxMs = opts?.maxMs ?? COPY_BUSY_WAIT_MS;
  const pollMs = opts?.pollMs ?? COPY_BUSY_POLL_MS;
  const sleep = opts?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let waited = 0;
  while (waited < maxMs && isCopyBusy(dataDir)) {
    await sleep(pollMs);
    waited += pollMs;
  }
  return isCopyBusy(dataDir);
}

/** Wait out Tafel sichern; do not snapshot while gzip is still running. */
export async function assertCopyIdle(
  dataDir: string,
  opts?: {
    maxMs?: number;
    pollMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
) {
  const still = await waitWhileCopyBusy(dataDir, opts);
  if (still) throw new Error("Die Tafel-Kopie kam mitten im Speichern.");
}

export function bumpCopySeq(dataDir: string) {
  const dir = String(dataDir ?? "").trim();
  if (!dir) return 0;
  const next = readCopySeq(dir) + 1;
  writeFileSync(copySeqPath(dir), `${next}\n`);
  return next;
}

/** Writer wrote during the copy, or is still writing — try again. */
export function anzeigeCopyShouldRetry(input: { busy: boolean; before: number; after: number }) {
  if (input.busy) return true;
  if (input.before > 0 && input.after !== input.before) return true;
  return false;
}

/** Hold copy-busy without bumping seq — read-only work that must not race a copy. */
export async function withCopyBusy<T>(dataDir: string | undefined, run: () => Promise<T>): Promise<T> {
  const dir = String(dataDir ?? "").trim();
  if (!dir) return run();
  addCopyBusyHolder(1);
  markCopyBusy(dir);
  try {
    return await run();
  } finally {
    clearCopyBusy(dir);
    addCopyBusyHolder(-1);
  }
}

export async function withWriterCopyGate<T>(
  dataDir: string | undefined,
  write: boolean,
  run: () => Promise<T>,
): Promise<T> {
  const dir = String(dataDir ?? "").trim();
  if (!dir || !write) return run();
  return withCopyBusy(dir, async () => {
    const result = await run();
    bumpCopySeq(dir);
    return result;
  });
}

type PgliteDumpSource = {
  exec: (sql: string) => Promise<unknown>;
  dumpDataDir: (format: "gzip") => Promise<Blob>;
};

export const DUMP_COPY_ATTEMPTS = 3;

const LOCK_FILE = "silvia.lock";

function isDumpSkipPath(path: string) {
  const name = String(path ?? "").split(/[\\/]/).pop() ?? "";
  return name === LOCK_FILE || isCopyGatePath(path);
}

function snapshotTafelForDump(src: string, dest: string) {
  rmDirRetrySync(dest);
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    filter: (path) => !isDumpSkipPath(path),
  });
}

/**
 * Gzip a folder copy of the Tafel. The live PGLite process is not asked to
 * dumpDataDir — that call hangs after a long Vite/npm start session.
 */
export async function dumpPgliteFromFolderCopy(dataDir: string) {
  const dir = String(dataDir ?? "").trim();
  if (!dir) throw new Error("Ohne Tafel-Ordner gibt es keine Sicherung.");
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const dest = await mkdtemp(join(tmpdir(), "silvia-tafel-dump-"));
  try {
    let copied = false;
    for (let attempt = 0; attempt < DUMP_COPY_ATTEMPTS; attempt++) {
      const before = readCopySeq(dir);
      snapshotTafelForDump(dir, dest);
      if (readCopySeq(dir) === before) {
        copied = true;
        break;
      }
    }
    if (!copied) throw new Error("Die Tafel änderte sich während der Sicherung.");
    const { PGlite } = await import("@electric-sql/pglite");
    const probe = new PGlite({ dataDir: dest });
    await probe.waitReady;
    try {
      try {
        await probe.exec("CHECKPOINT");
      } catch (checkpointErr) {
        // Nicht still: ein fehlgeschlagenes CHECKPOINT kann eine zerrissene
        // Sicherung bedeuten, die erst im Ernstfall (beim Wiederherstellen) auffällt.
        console.error("[backup] CHECKPOINT der Kopie fehlgeschlagen", checkpointErr);
      }
      return await probe.dumpDataDir("gzip");
    } finally {
      if (!probe.closed) await probe.close().catch(() => undefined);
    }
  } finally {
    await rmDirRetry(dest).catch(() => undefined);
  }
}

/** Gzip the Tafel. File-backed dirs dump a copy; RAM still dumps the live handle. */
export async function dumpPgliteAfterCheckpoint(pg: PgliteDumpSource, dataDir?: string) {
  return withCopyBusy(dataDir, async () => {
    const dir = String(dataDir ?? "").trim();
    if (dir) return dumpPgliteFromFolderCopy(dir);
    try {
      await pg.exec("CHECKPOINT");
    } catch (checkpointErr) {
      // Nicht still: ein fehlgeschlagenes CHECKPOINT kann eine zerrissene
      // Sicherung bedeuten, die erst im Ernstfall (beim Wiederherstellen) auffällt.
      console.error("[backup] CHECKPOINT fehlgeschlagen", checkpointErr);
    }
    return pg.dumpDataDir("gzip");
  });
}
