import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { writeTafelBackupCopy } from "./pglite-backup-copy.ts";
import { resolvePgliteBackupDir } from "./pglite-data-dir.ts";

test("resolvePgliteBackupDir defaults to a sibling, never inside the data dir", () => {
  const dataDir = join(tmpdir(), "silvia-data");
  assert.equal(resolvePgliteBackupDir({}, "/ordi", dataDir), `${dataDir}.backup`);
  assert.equal(
    resolvePgliteBackupDir({ SILVIA_BACKUP_DIR: "backups" }, "/ordi", dataDir),
    join("/ordi", "backups"),
  );
  assert.equal(
    resolvePgliteBackupDir({ SILVIA_BACKUP_DIR: "/mnt/backup" }, "/ordi", dataDir),
    "/mnt/backup",
  );
  // RAM mode (SILVIA_DATA_DIR=memory) without an override -> no copy target
  assert.equal(resolvePgliteBackupDir({ SILVIA_DATA_DIR: "memory" }, "/ordi"), undefined);
  // a "memory" override keeps the no-disk path even with a data dir
  assert.equal(resolvePgliteBackupDir({ SILVIA_BACKUP_DIR: "memory" }, "/ordi", dataDir), undefined);
});

test("writeTafelBackupCopy writes a byte-identical copy in the sibling .backup dir", () => {
  const dir = join(tmpdir(), `silvia-backup-copy-${process.pid}`);
  const dataDir = join(dir, "data");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  const filename = "silvia-tafel-2026-09-21.tar.gz.silvia";
  const bytes = new Uint8Array([0x53, 0x4c, 0x56, 0x42, 0x4b, 0x30, 0x31, 1, 2, 3]);
  const path = writeTafelBackupCopy(dataDir, filename, bytes, {});
  // exactly the sibling .backup dir, not inside the data dir
  assert.equal(path, join(`${dataDir}.backup`, filename));
  assert.deepEqual(new Uint8Array(readFileSync(path)), bytes);
  // no dir (RAM) -> no copy, empty path
  assert.equal(writeTafelBackupCopy(undefined, "x.silvia", bytes, { SILVIA_DATA_DIR: "memory" }), "");
  rmSync(dir, { recursive: true, force: true });
});
