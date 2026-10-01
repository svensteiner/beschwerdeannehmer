import { rmSync } from "node:fs";
import { rm } from "node:fs/promises";

/** Windows PGLite keeps WASM files open a beat after `close()`. */
export const RM_RETRY_CODES = new Set(["EBUSY", "EPERM", "EACCES"]);
export const RM_RETRY_ATTEMPTS = 8;
export const RM_RETRY_MS = 40;

export function isRetryableFsError(err: unknown) {
  const code =
    err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : "";
  return RM_RETRY_CODES.has(code);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

type RmFn = (path: string, opts: { recursive: boolean; force: boolean }) => Promise<void>;

/** Drop a Tafel folder after PGLite close — retry Windows locks. */
export async function rmDirRetry(
  path: string,
  io: { rm?: RmFn; waitMs?: (ms: number) => Promise<void> } = {},
) {
  const remove = io.rm ?? rm;
  const waitMs = io.waitMs ?? wait;
  let last: unknown;
  for (let i = 0; i < RM_RETRY_ATTEMPTS; i++) {
    try {
      await remove(path, { recursive: true, force: true });
      return;
    } catch (err) {
      last = err;
      if (!isRetryableFsError(err) || i === RM_RETRY_ATTEMPTS - 1) throw err;
      await waitMs(RM_RETRY_MS * (i + 1));
    }
  }
  throw last;
}

type RmSyncFn = (path: string, opts: { recursive: boolean; force: boolean }) => void;

export function rmDirRetrySync(path: string, io: { rmSync?: RmSyncFn } = {}) {
  const remove = io.rmSync ?? rmSync;
  let last: unknown;
  for (let i = 0; i < RM_RETRY_ATTEMPTS; i++) {
    try {
      remove(path, { recursive: true, force: true });
      return;
    } catch (err) {
      last = err;
      if (!isRetryableFsError(err) || i === RM_RETRY_ATTEMPTS - 1) throw err;
      const until = Date.now() + RM_RETRY_MS * (i + 1);
      while (Date.now() < until) {
        /* spin — Anzeige refresh is already on the replace chain */
      }
    }
  }
  throw last;
}
