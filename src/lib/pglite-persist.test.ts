import assert from "node:assert/strict";
import { mkdir, mkdtemp, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { deskBackupStampAfterRestore } from "./practice/desk-storage.ts";
import {
  readLastTafelBackupFile,
  writeLastTafelBackupFile,
} from "./pglite-backup-stamp.ts";
import { COPY_BUSY_FILE, dumpPgliteAfterCheckpoint, readCopySeq } from "./pglite-copy-gate.ts";
import { rmDirRetry } from "./pglite-fs.ts";

test("PGLite file directory keeps rows after close and reopen", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silvia-pg-"));
  try {
    const first = new PGlite(dir);
    await first.waitReady;
    await first.exec("create table practices (id text primary key, name text not null)");
    await first.query("insert into practices (id, name) values ($1, $2)", ["p1", "Tafel"]);
    await first.close();

    const second = new PGlite(dir);
    await second.waitReady;
    const rows = await second.query<{ id: string; name: string }>("select id, name from practices");
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0]?.id, "p1");
    assert.equal(rows.rows[0]?.name, "Tafel");
    await second.close();
  } finally {
    await rmDirRetry(dir);
  }
});

test("PGLite dumpDataDir gzip reopens the Tafel", async () => {
  const first = new PGlite();
  await first.waitReady;
  await first.exec("create table practices (id text primary key, name text not null)");
  await first.query("insert into practices (id, name) values ($1, $2)", ["p1", "Tafel"]);
  const dump = await first.dumpDataDir("gzip");
  assert.ok(dump.size > 32);
  await first.close();

  const second = new PGlite({ loadDataDir: dump });
  await second.waitReady;
  const rows = await second.query<{ name: string }>("select name from practices");
  assert.equal(rows.rows[0]?.name, "Tafel");
  await second.close();
});

test("PGLite gzip dump replaces a file-backed Tafel after close", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silvia-pg-restore-"));
  try {
    const first = new PGlite(dir);
    await first.waitReady;
    await first.exec("create table practices (id text primary key, name text not null)");
    await first.query("insert into practices (id, name) values ($1, $2)", ["p1", "Alt"]);
    const dump = await first.dumpDataDir("gzip");
    await first.query("update practices set name = $1", ["Neu"]);
    await first.close();

    const prev = `${dir}.prev`;
    await rmDirRetry(prev);
    await rename(dir, prev);
    await mkdir(dir, { recursive: true });
    const second = new PGlite({ dataDir: dir, loadDataDir: dump });
    await second.waitReady;
    const restored = await second.query<{ name: string }>("select name from practices");
    assert.equal(restored.rows[0]?.name, "Alt");
    await second.close();
    await rmDirRetry(prev);

    const third = new PGlite(dir);
    await third.waitReady;
    const persisted = await third.query<{ name: string }>("select name from practices");
    assert.equal(persisted.rows[0]?.name, "Alt");
    await third.close();
  } finally {
    await rmDirRetry(dir);
    await rmDirRetry(`${dir}.prev`);
  }
});

test("Tafel sichern dumps a folder copy so the live process is not asked", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silvia-pg-dump-copy-"));
  const live = new PGlite(dir);
  await live.waitReady;
  try {
    await live.exec("create table practices (id text primary key, name text not null)");
    await live.query("insert into practices (id, name) values ($1, $2)", ["p1", "Kopie"]);
    const dump = await dumpPgliteAfterCheckpoint(
      {
        exec: async () => {
          throw new Error("live checkpoint");
        },
        dumpDataDir: async () => {
          throw new Error("live dump");
        },
      },
      dir,
    );
    assert.ok(dump.size > 32);
    const raw = new Uint8Array(await dump.arrayBuffer());
    assert.equal(raw[0], 0x1f);
    assert.equal(raw[1], 0x8b);
    const loaded = new PGlite({ loadDataDir: dump });
    await loaded.waitReady;
    const rows = await loaded.query<{ name: string }>("select name from practices");
    assert.equal(rows.rows[0]?.name, "Kopie");
    await loaded.close();
    assert.equal(existsSync(join(dir, COPY_BUSY_FILE)), false);
    assert.equal(readCopySeq(dir), 0);
  } finally {
    await live.close();
    await rmDirRetry(dir);
  }
});

test("Tafel sichern checkpoints and leaves no copy-busy file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silvia-pg-dump-"));
  try {
    const pg = new PGlite(dir);
    await pg.waitReady;
    await pg.exec("create table practices (id text primary key, name text not null)");
    await pg.query("insert into practices (id, name) values ($1, $2)", ["p1", "Tafel"]);
    const dump = await dumpPgliteAfterCheckpoint(pg, dir);
    assert.ok(dump.size > 32);
    const raw = new Uint8Array(await dump.arrayBuffer());
    assert.equal(raw[0], 0x1f);
    assert.equal(raw[1], 0x8b);
    assert.equal(existsSync(join(dir, COPY_BUSY_FILE)), false);
    assert.equal(readCopySeq(dir), 0);
    await pg.close();
  } finally {
    await rmDirRetry(dir);
  }
});

test("Tafel holen writes a backup stamp when the gzip has no sidecar", async () => {
  const source = await mkdtemp(join(tmpdir(), "silvia-pg-stamp-src-"));
  const dest = await mkdtemp(join(tmpdir(), "silvia-pg-stamp-dst-"));
  try {
    const pg = new PGlite(source);
    await pg.waitReady;
    await pg.exec("create table practices (id text primary key, name text not null)");
    await pg.query("insert into practices (id, name) values ($1, $2)", ["p1", "Tafel"]);
    const dumpAt = "2026-08-29T18:05:00.000Z";
    writeLastTafelBackupFile(source, dumpAt);
    const dump = await dumpPgliteAfterCheckpoint(pg, source);
    assert.equal(readLastTafelBackupFile(source), dumpAt);
    await pg.close();

    const loaded = new PGlite({ dataDir: dest, loadDataDir: dump });
    await loaded.waitReady;
    const fromDump = readLastTafelBackupFile(dest);
    const at = deskBackupStampAfterRestore({
      fromDump,
      backupAt: null,
      filename: "silvia-tafel-2026-08-27.tar.gz",
      now: new Date("2026-08-29T20:00:00.000Z"),
    });
    writeLastTafelBackupFile(dest, at);
    assert.ok(readLastTafelBackupFile(dest));
    if (!fromDump) {
      assert.equal(readLastTafelBackupFile(dest), new Date(2026, 7, 27, 12, 0, 0).toISOString());
    } else {
      assert.equal(readLastTafelBackupFile(dest), dumpAt);
    }
    await loaded.close();
  } finally {
    await rmDirRetry(source);
    await rmDirRetry(dest);
  }
});

test("old gzip without sidecar uses the filename day after Tafel holen", async () => {
  const source = await mkdtemp(join(tmpdir(), "silvia-pg-old-src-"));
  const dest = await mkdtemp(join(tmpdir(), "silvia-pg-old-dst-"));
  try {
    const pg = new PGlite(source);
    await pg.waitReady;
    await pg.exec("create table practices (id text primary key, name text not null)");
    await pg.query("insert into practices (id, name) values ($1, $2)", ["p1", "Alt"]);
    const dump = await pg.dumpDataDir("gzip");
    await pg.close();

    const loaded = new PGlite({ dataDir: dest, loadDataDir: dump });
    await loaded.waitReady;
    assert.equal(readLastTafelBackupFile(dest), null);
    const at = deskBackupStampAfterRestore({
      fromDump: readLastTafelBackupFile(dest),
      backupAt: null,
      filename: "silvia-tafel-2026-08-29.tar.gz",
      now: new Date("2026-08-29T21:00:00.000Z"),
    });
    writeLastTafelBackupFile(dest, at);
    assert.equal(readLastTafelBackupFile(dest), new Date(2026, 7, 29, 12, 0, 0).toISOString());
    await loaded.close();
  } finally {
    await rmDirRetry(source);
    await rmDirRetry(dest);
  }
});
