import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LAST_TAFEL_BACKUP_FILE } from "./practice/desk-storage.ts";
import {
  clearLastTafelBackupFile,
  lastTafelBackupPath,
  markTafelBackupBeforeDump,
  readLastTafelBackupFile,
  rollbackTafelBackupStamp,
  writeLastTafelBackupFile,
} from "./pglite-backup-stamp.ts";

test("Tafel backup stamp is a sidecar next to the PGLite dir", () => {
  const dir = join(tmpdir(), `silvia-backup-stamp-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(readLastTafelBackupFile(""), null);
  assert.equal(readLastTafelBackupFile(undefined), null);
  assert.equal(writeLastTafelBackupFile(dir), "");
  mkdirSync(dir, { recursive: true });
  const at = new Date("2026-08-29T18:05:00.000Z");
  const iso = writeLastTafelBackupFile(dir, at);
  assert.equal(iso, "2026-08-29T18:05:00.000Z");
  assert.equal(lastTafelBackupPath(dir), join(dir, LAST_TAFEL_BACKUP_FILE));
  assert.equal(readFileSync(lastTafelBackupPath(dir), "utf8").trim(), iso);
  assert.equal(readLastTafelBackupFile(dir), iso);
  assert.equal(readLastTafelBackupFile(join(dir, "missing")), null);
  assert.equal(writeLastTafelBackupFile(dir, "2026-08-29T19:00:00.000Z"), "2026-08-29T19:00:00.000Z");
  const marked = markTafelBackupBeforeDump(dir, new Date("2026-08-29T20:00:00.000Z"));
  assert.equal(marked.previous, "2026-08-29T19:00:00.000Z");
  assert.equal(marked.iso, "2026-08-29T20:00:00.000Z");
  assert.equal(readLastTafelBackupFile(dir), "2026-08-29T20:00:00.000Z");
  rollbackTafelBackupStamp(dir, marked.previous);
  assert.equal(readLastTafelBackupFile(dir), "2026-08-29T19:00:00.000Z");
  rollbackTafelBackupStamp(dir, null);
  assert.equal(readLastTafelBackupFile(dir), null);
  writeLastTafelBackupFile(dir, at);
  clearLastTafelBackupFile(dir);
  assert.equal(readLastTafelBackupFile(dir), null);
  rmSync(dir, { recursive: true, force: true });
});
