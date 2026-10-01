import { access, mkdir, rename } from "node:fs/promises";

const MAX_PGLITE_RESTORE_UNPACKED_BYTES = 1024 * 1024 * 1024;
export const PGLITE_RESTORE_GZIP_ERROR = "Die Sicherung ist beschädigt oder keine gültige gzip-Datei.";
export const PGLITE_RESTORE_GZIP_TOO_LARGE = "Die entpackte Sicherung ist zu groß.";

type RestoreFs = { access: typeof access; mkdir: typeof mkdir; rename: typeof rename };

type RestoreTestHooks = {
  fs?: Partial<RestoreFs>;
  removeDir?: (path: string) => void | Promise<void>;
  beforeLoad?: () => void | Promise<void>;
};

let testHooks: RestoreTestHooks | undefined;
let loadStarts = 0;

/** Test-only seam for restore fault injection; production uses node:fs unchanged. */
export function setPgliteRestoreTestHooks(hooks?: RestoreTestHooks) {
  testHooks = hooks;
  loadStarts = 0;
}

export function pgliteRestoreLoadStartsForTest() {
  return loadStarts;
}

export async function pgliteRestoreFs(): Promise<RestoreFs> {
  return {
    access: testHooks?.fs?.access ?? access,
    mkdir: testHooks?.fs?.mkdir ?? mkdir,
    rename: testHooks?.fs?.rename ?? rename,
  };
}

export async function beforePgliteRestoreLoad() {
  loadStarts += 1;
  await testHooks?.beforeLoad?.();
}

/**
 * PGLite currently delegates gzip loading to a Web stream. Node can surface a
 * malformed stream as an uncaught adapter error, so validate it with Node's
 * streaming gzip reader before PGLite ever receives the archive.
 */
export async function assertPgliteRestoreGzip(dump: Blob) {
  const raw = new Uint8Array(await dump.arrayBuffer());
  const [{ Readable, Writable }, { pipeline }, { createGunzip }] = await Promise.all([
    import("node:stream"),
    import("node:stream/promises"),
    import("node:zlib"),
  ]);
  let unpackedBytes = 0;
  let tooLarge = false;
  const count = new Writable({
    write(chunk, _encoding, callback) {
      unpackedBytes += chunk.length;
      if (unpackedBytes > MAX_PGLITE_RESTORE_UNPACKED_BYTES) {
        tooLarge = true;
        callback(new Error(PGLITE_RESTORE_GZIP_TOO_LARGE));
        return;
      }
      callback();
    },
  });
  try {
    await pipeline(Readable.from([raw]), createGunzip(), count);
  } catch {
    throw new Error(tooLarge ? PGLITE_RESTORE_GZIP_TOO_LARGE : PGLITE_RESTORE_GZIP_ERROR);
  }
}

/** Returns true when a test override removed (or deliberately failed to remove) the folder. */
export async function removePgliteRestoreDirForTest(path: string) {
  if (!testHooks?.removeDir) return false;
  await testHooks.removeDir(path);
  return true;
}
