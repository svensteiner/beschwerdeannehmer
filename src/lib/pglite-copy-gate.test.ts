import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import {
  COPY_BUSY_FILE,
  COPY_SEQ_FILE,
  anzeigeCopyShouldRetry,
  bumpCopySeq,
  clearCopyBusy,
  copyBusySidecarPath,
  isCopyBusy,
  isCopyGatePath,
  liveCopyBusyHolders,
  markCopyBusy,
  recoverStaleCopyBusy,
  readCopyBusyCount,
  readCopySeq,
  waitWhileCopyBusy,
  withCopyBusy,
  withWriterCopyGate,
  assertCopyIdle,
  COPY_BUSY_WAIT_MS,
} from "./pglite-copy-gate.ts";

test("Anzeige retries when the writer is busy or the seq moved", () => {
  assert.equal(anzeigeCopyShouldRetry({ busy: false, before: 3, after: 3 }), false);
  assert.equal(anzeigeCopyShouldRetry({ busy: true, before: 3, after: 3 }), true);
  assert.equal(anzeigeCopyShouldRetry({ busy: false, before: 3, after: 4 }), true);
  assert.equal(anzeigeCopyShouldRetry({ busy: false, before: 0, after: 0 }), false);
});

test("copy-seq and busy stay on the writer folder, not as Anzeige payload", () => {
  assert.equal(isCopyGatePath(`/ordi/.silvia-data/${COPY_SEQ_FILE}`), true);
  assert.equal(isCopyGatePath(`/ordi/.silvia-data/${COPY_BUSY_FILE}`), true);
  assert.equal(isCopyGatePath("/ordi/.silvia-data/PG_VERSION"), false);
});

test("writer bumps seq only after a write and clears busy", async () => {
  const dir = join(tmpdir(), `silvia-copy-gate-${process.pid}`);
  await mkdir(dir, { recursive: true });
  try {
    assert.equal(readCopySeq(dir), 0);
    assert.equal(isCopyBusy(dir), false);
    const out = await withWriterCopyGate(dir, true, async () => {
      assert.equal(isCopyBusy(dir), true);
      return "ok";
    });
    assert.equal(out, "ok");
    assert.equal(readCopySeq(dir), 1);
    assert.equal(isCopyBusy(dir), false);
    assert.match(await readFile(join(dir, COPY_SEQ_FILE), "utf8"), /^1\n/);
    await withWriterCopyGate(dir, false, async () => "skip");
    assert.equal(readCopySeq(dir), 1);
    markCopyBusy(dir);
    assert.equal(isCopyBusy(dir), true);
    clearCopyBusy(dir);
    assert.equal(isCopyBusy(dir), false);
    assert.equal(bumpCopySeq(dir), 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("nested Tafel sichern plus a write stay busy until both finish", async () => {
  const dir = join(tmpdir(), `silvia-copy-busy-nest-${process.pid}`);
  await mkdir(dir, { recursive: true });
  try {
    await withCopyBusy(dir, async () => {
      assert.equal(readCopyBusyCount(dir), 1);
      await withWriterCopyGate(dir, true, async () => {
        assert.equal(isCopyBusy(dir), true);
        assert.equal(readCopyBusyCount(dir), 2);
      });
      assert.equal(isCopyBusy(dir), true);
      assert.equal(readCopyBusyCount(dir), 1);
      assert.equal(readCopySeq(dir), 1);
    });
    assert.equal(isCopyBusy(dir), false);
    assert.equal(readCopyBusyCount(dir), 0);
    markCopyBusy(dir);
    markCopyBusy(dir);
    assert.equal(readCopyBusyCount(dir), 2);
    clearCopyBusy(dir);
    assert.equal(isCopyBusy(dir), true);
    assert.equal(readCopyBusyCount(dir), 1);
    clearCopyBusy(dir);
    assert.equal(isCopyBusy(dir), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(copyBusySidecarPath(dir), { force: true });
  }
});

test("Tafel sichern holds busy without bumping seq", async () => {
  const dir = join(tmpdir(), `silvia-copy-busy-dump-${process.pid}`);
  await mkdir(dir, { recursive: true });
  try {
    await withWriterCopyGate(dir, true, async () => "seed");
    assert.equal(readCopySeq(dir), 1);
    const out = await withCopyBusy(dir, async () => {
      assert.equal(isCopyBusy(dir), true);
      return "dump";
    });
    assert.equal(out, "dump");
    assert.equal(readCopySeq(dir), 1);
    assert.equal(isCopyBusy(dir), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a failed write still drops the busy file", async () => {
  const dir = join(tmpdir(), `silvia-copy-gate-fail-${process.pid}`);
  await mkdir(dir, { recursive: true });
  try {
    await assert.rejects(
      () =>
        withWriterCopyGate(dir, true, async () => {
          throw new Error("boom");
        }),
      /boom/,
    );
    assert.equal(isCopyBusy(dir), false);
    assert.equal(readCopySeq(dir), 0);
    await writeFile(join(dir, COPY_SEQ_FILE), "nope\n");
    assert.equal(readCopySeq(dir), 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("copy-busy sidecar stays when Tafel holen renames the folder", async () => {
  const dir = join(tmpdir(), `silvia-copy-busy-holen-${process.pid}`);
  const prev = `${dir}.prev`;
  await mkdir(dir, { recursive: true });
  try {
    markCopyBusy(dir);
    assert.equal(isCopyBusy(dir), true);
    assert.equal(existsSync(copyBusySidecarPath(dir)), true);
    assert.equal(existsSync(join(dir, COPY_BUSY_FILE)), true);
    await rename(dir, prev);
    assert.equal(existsSync(dir), false);
    assert.equal(isCopyBusy(dir), true);
    await mkdir(dir, { recursive: true });
    assert.equal(isCopyBusy(dir), true);
    clearCopyBusy(dir);
    assert.equal(isCopyBusy(dir), false);
    assert.equal(existsSync(copyBusySidecarPath(dir)), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(prev, { recursive: true, force: true });
    await rm(copyBusySidecarPath(dir), { force: true });
  }
});

test("Anzeige waits up to two minutes for Tafel sichern, then refuses a torn copy", async () => {
  assert.equal(COPY_BUSY_WAIT_MS, 120_000);
  const dir = join(tmpdir(), `silvia-copy-idle-${process.pid}`);
  await mkdir(dir, { recursive: true });
  try {
    markCopyBusy(dir);
    let polls = 0;
    await assertCopyIdle(dir, {
      maxMs: 80,
      pollMs: 20,
      sleep: async () => {
        polls += 1;
        if (polls === 2) clearCopyBusy(dir);
      },
    });
    assert.ok(polls >= 2);
    markCopyBusy(dir);
    await assert.rejects(
      () => assertCopyIdle(dir, { maxMs: 40, pollMs: 20, sleep: async () => undefined }),
      /mitten im Speichern/,
    );
    assert.equal(isCopyBusy(dir), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(copyBusySidecarPath(dir), { force: true });
  }
});

test("writer boot drops a leftover copy-busy when this process holds none", async () => {
  const dir = join(tmpdir(), `silvia-copy-busy-stale-${process.pid}`);
  await mkdir(dir, { recursive: true });
  try {
    assert.equal(recoverStaleCopyBusy(""), false);
    assert.equal(recoverStaleCopyBusy(dir), false);
    await writeFile(join(dir, COPY_BUSY_FILE), "1\n");
    await writeFile(copyBusySidecarPath(dir), "1\n");
    assert.equal(isCopyBusy(dir), true);
    assert.equal(liveCopyBusyHolders(), 0);
    assert.equal(recoverStaleCopyBusy(dir), true);
    assert.equal(isCopyBusy(dir), false);
    assert.equal(existsSync(copyBusySidecarPath(dir)), false);
    assert.equal(existsSync(join(dir, COPY_BUSY_FILE)), false);
    await withCopyBusy(dir, async () => {
      assert.ok(liveCopyBusyHolders() >= 1);
      assert.equal(recoverStaleCopyBusy(dir), false);
      assert.equal(isCopyBusy(dir), true);
    });
    assert.equal(liveCopyBusyHolders(), 0);
    assert.equal(isCopyBusy(dir), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(copyBusySidecarPath(dir), { force: true });
  }
});

test("Anzeige waits while copy-busy then proceeds", async () => {
  const dir = join(tmpdir(), `silvia-copy-busy-wait-${process.pid}`);
  await mkdir(dir, { recursive: true });
  try {
    markCopyBusy(dir);
    let polls = 0;
    const still = waitWhileCopyBusy(dir, {
      maxMs: 80,
      pollMs: 20,
      sleep: async () => {
        polls += 1;
        if (polls === 2) clearCopyBusy(dir);
      },
    });
    assert.equal(await still, false);
    assert.ok(polls >= 2);
    markCopyBusy(dir);
    assert.equal(await waitWhileCopyBusy(dir, { maxMs: 40, pollMs: 20, sleep: async () => undefined }), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(copyBusySidecarPath(dir), { force: true });
  }
});
