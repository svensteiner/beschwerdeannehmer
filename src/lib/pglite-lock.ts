import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const PGLITE_LOCK_FILE = "silvia.lock";
export const PGLITE_HELD_PREFIX = "Die Tafel ist schon offen";

export function pgliteHeldError(pid?: number): string {
  const who = Number.isInteger(pid) && (pid as number) > 0 ? ` (Prozess ${pid})` : "";
  return `${PGLITE_HELD_PREFIX}${who}. Den anderen Prozess beenden, dann npm start — nicht npm run dev gleichzeitig.`;
}

export function isPgliteHeldError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.startsWith(PGLITE_HELD_PREFIX);
}

export function pgliteLockPath(dataDir: string) {
  return join(dataDir, PGLITE_LOCK_FILE);
}

export function renderPgliteLock(pid: number, now = new Date()) {
  return `Silvia\npid=${pid}\nseit=${now.toISOString()}\n`;
}

export function parsePgliteLock(raw: string): { pid: number } | null {
  const match = /(?:^|\n)pid=(\d+)/.exec(raw);
  const pid = match ? Number(match[1]) : NaN;
  if (!Number.isInteger(pid) || pid <= 0) return null;
  return { pid };
}

export function pidIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists, we just cannot signal it (pid 1, other users).
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

type LockOpts = {
  pid?: number;
  alive?: (pid: number) => boolean;
  now?: Date;
};

export async function acquirePgliteLock(dataDir: string, opts: LockOpts = {}): Promise<void> {
  const pid = opts.pid ?? process.pid;
  const alive = opts.alive ?? pidIsAlive;
  await mkdir(dataDir, { recursive: true });
  const path = pgliteLockPath(dataDir);
  let existing = "";
  try {
    existing = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  if (existing) {
    const parsed = parsePgliteLock(existing);
    if (parsed && parsed.pid !== pid && alive(parsed.pid)) {
      throw new Error(pgliteHeldError(parsed.pid));
    }
  }
  await writeFile(path, renderPgliteLock(pid, opts.now ?? new Date()), { encoding: "utf8" });
  registerLockCleanup(path, pid);
}

export async function releasePgliteLock(dataDir: string, pid = process.pid): Promise<void> {
  const path = pgliteLockPath(dataDir);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = parsePgliteLock(raw);
    if (parsed && parsed.pid !== pid) return;
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

const globalRef = globalThis as typeof globalThis & {
  __silviaPgliteLockCleanup__?: string;
};

function registerLockCleanup(path: string, pid: number) {
  if (globalRef.__silviaPgliteLockCleanup__ === path) return;
  globalRef.__silviaPgliteLockCleanup__ = path;
  const drop = () => {
    try {
      const raw = readFileSync(path, "utf8");
      const parsed = parsePgliteLock(raw);
      if (parsed?.pid === pid) unlinkSync(path);
    } catch {
      /* already gone */
    }
  };
  process.on("exit", drop);
}
