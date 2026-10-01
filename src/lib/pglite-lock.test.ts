import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  PGLITE_LOCK_FILE,
  acquirePgliteLock,
  isPgliteHeldError,
  parsePgliteLock,
  pgliteHeldError,
  pgliteLockPath,
  pidIsAlive,
  releasePgliteLock,
  renderPgliteLock,
} from "./pglite-lock.ts";

test("lock file names the pid so the Inhaberin can cat it", () => {
  const body = renderPgliteLock(4242, new Date("2026-08-26T17:00:00.000Z"));
  assert.match(body, /^Silvia\n/);
  assert.match(body, /pid=4242/);
  assert.equal(parsePgliteLock(body)?.pid, 4242);
  assert.equal(parsePgliteLock("nope"), null);
  assert.equal(pgliteLockPath("/ordi/.silvia-data"), join("/ordi/.silvia-data", PGLITE_LOCK_FILE));
});

test("held copy names the other process and is recognizable", () => {
  const msg = pgliteHeldError(4242);
  assert.match(msg, /^Die Tafel ist schon offen \(Prozess 4242\)\./);
  assert.match(msg, /npm start/);
  assert.match(msg, /npm run dev/);
  assert.equal(isPgliteHeldError(new Error(msg)), true);
  assert.equal(isPgliteHeldError(new Error("EADDRINUSE")), false);
});

test("pid 1 counts as live even when signaling it is forbidden", () => {
  // Unix: pid 1 (init) always exists but an unprivileged process cannot
  // signal it, so process.kill throws EPERM — pidIsAlive treats that as
  // "alive". Windows has no pid 1 (no init process), so the same call
  // throws ESRCH ("no such process") and pidIsAlive correctly says false —
  // this assertion is Unix-only, not a Windows flake to paper over.
  assert.equal(pidIsAlive(1), process.platform !== "win32");
  assert.equal(pidIsAlive(999_999_999), false);
  assert.equal(pidIsAlive(0), false);
});

test("a live foreign pid refuses; a dead pid is taken over", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silvia-lock-"));
  try {
    await writeFile(join(dir, PGLITE_LOCK_FILE), renderPgliteLock(4242));
    await assert.rejects(
      () => acquirePgliteLock(dir, { pid: 99, alive: (p) => p === 4242 }),
      (err: unknown) => {
        assert.equal(isPgliteHeldError(err), true);
        assert.match((err as Error).message, /4242/);
        return true;
      },
    );
    await acquirePgliteLock(dir, { pid: 99, alive: () => false });
    const raw = await readFile(join(dir, PGLITE_LOCK_FILE), "utf8");
    assert.equal(parsePgliteLock(raw)?.pid, 99);
    await releasePgliteLock(dir, 99);
    await assert.rejects(readFile(join(dir, PGLITE_LOCK_FILE), "utf8"), { code: "ENOENT" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the same pid may reopen after HMR", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silvia-lock-same-"));
  try {
    await acquirePgliteLock(dir, { pid: 77, alive: () => true });
    await acquirePgliteLock(dir, { pid: 77, alive: () => true });
    const raw = await readFile(join(dir, PGLITE_LOCK_FILE), "utf8");
    assert.equal(parsePgliteLock(raw)?.pid, 77);
    await releasePgliteLock(dir, 12);
    const still = await readFile(join(dir, PGLITE_LOCK_FILE), "utf8");
    assert.equal(parsePgliteLock(still)?.pid, 77);
    await releasePgliteLock(dir, 77);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
