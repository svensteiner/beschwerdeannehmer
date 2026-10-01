import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { COPY_BUSY_FILE, COPY_SEQ_FILE } from "./pglite-copy-gate.ts";
import { PGLITE_LOCK_FILE } from "./pglite-lock.ts";
import {
  ANZEIGE_COPY_ATTEMPTS,
  TAFEL_ANZEIGE_BANNER,
  TAFEL_ANZEIGE_ERROR,
  anzeigeAltDir,
  isPgliteLockPath,
  isTafelAnzeige,
  isTafelAnzeigeError,
  pgliteAnzeigeDir,
  pgliteSnapshotReady,
  setTafelAnzeige,
  snapshotPgliteDataDir,
  sqlIsAnzeigeAllowed,
  sqlIsReadOnly,
  sqlIsSessionWrite,
  tafelWriteBlock,
  wantsForcedAnzeige,
} from "./pglite-anzeige.ts";

test("Anzeige copy names a process folder and skips the write lock", () => {
  assert.equal(pgliteAnzeigeDir(4242).includes("silvia-anzeige-4242"), true);
  assert.equal(isPgliteLockPath(`/ordi/.silvia-data/${PGLITE_LOCK_FILE}`), true);
  assert.equal(isPgliteLockPath("/ordi/.silvia-data/PG_VERSION"), false);
});

test("Anzeige refresh copies into an alt folder, not the live one", () => {
  assert.equal(ANZEIGE_COPY_ATTEMPTS, 3);
  const live = "/tmp/silvia-anzeige-9";
  const alt = anzeigeAltDir(live);
  assert.equal(alt, "/tmp/silvia-anzeige-9-b");
  assert.equal(anzeigeAltDir(alt), live);
  assert.notEqual(alt, live);
});

test("a Tafel copy without PG_VERSION or base is not ready", async () => {
  const root = join(tmpdir(), `silvia-anzeige-ready-${process.pid}`);
  const empty = join(root, "empty");
  const ok = join(root, "ok");
  await mkdir(empty, { recursive: true });
  await mkdir(join(ok, "base"), { recursive: true });
  await writeFile(join(ok, "PG_VERSION"), "16\n");
  try {
    assert.equal(pgliteSnapshotReady(empty), false);
    assert.equal(pgliteSnapshotReady(ok), true);
    assert.equal(pgliteSnapshotReady("/no/such/tafel"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Anzeige copy leaves silvia.lock behind so the writer keeps the Tafel", async () => {
  const root = join(tmpdir(), `silvia-anzeige-copy-${process.pid}`);
  const src = join(root, "src");
  const dest = join(root, "dest");
  await mkdir(src, { recursive: true });
  await writeFile(join(src, "PG_VERSION"), "16\n");
  await writeFile(join(src, PGLITE_LOCK_FILE), "Silvia\npid=9\n");
  await writeFile(join(src, COPY_SEQ_FILE), "4\n");
  await writeFile(join(src, COPY_BUSY_FILE), "1\n");
  try {
    snapshotPgliteDataDir(src, dest);
    assert.equal(await readFile(join(dest, "PG_VERSION"), "utf8"), "16\n");
    assert.equal(existsSync(join(dest, PGLITE_LOCK_FILE)), false);
    assert.equal(existsSync(join(dest, COPY_SEQ_FILE)), false);
    assert.equal(existsSync(join(dest, COPY_BUSY_FILE)), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("only SELECT stays writable-false; INSERT is a write", () => {
  assert.equal(sqlIsReadOnly("select id from appointments"), true);
  assert.equal(sqlIsReadOnly("WITH x AS (select 1) select * from x"), true);
  assert.equal(sqlIsReadOnly("insert into appointments (id) values ($1)"), false);
  assert.equal(sqlIsReadOnly("update patients set phone = $1"), false);
  assert.equal(sqlIsReadOnly("select save_hoer_korrektur_atomic($1,$2,$3,$4,$5,$6)"), false);
  assert.equal(sqlIsReadOnly("WITH x AS (select 1) insert into t select * from x"), false);
  assert.equal(sqlIsReadOnly("create table if not exists _migrations (name text)"), false);
  assert.equal(sqlIsSessionWrite("insert into practice_sessions (id, user_id, token_hash, expires_at) values ($1,$2,$3,$4)"), true);
  assert.equal(sqlIsSessionWrite("delete from practice_sessions where token_hash = $1"), true);
  assert.equal(sqlIsSessionWrite("insert into appointments (id) values ($1)"), false);
  assert.equal(sqlIsSessionWrite("insert into praxissoftware_spiegel (id) values ($1)"), false);
  assert.equal(sqlIsAnzeigeAllowed("insert into practice_sessions (id) values ($1)"), true);
  assert.equal(sqlIsAnzeigeAllowed("insert into appointments (id) values ($1)"), false);
  assert.equal(sqlIsAnzeigeAllowed("insert into praxissoftware_spiegel (id) values ($1)"), false);
});

test("write block is on only after the second process marked Anzeige", () => {
  setTafelAnzeige(false);
  assert.equal(isTafelAnzeige(), false);
  assert.equal(tafelWriteBlock(), null);
  setTafelAnzeige(true);
  assert.deepEqual(tafelWriteBlock(), { error: TAFEL_ANZEIGE_ERROR });
  assert.equal(isTafelAnzeigeError(new Error(TAFEL_ANZEIGE_ERROR)), true);
  assert.match(TAFEL_ANZEIGE_BANNER, /anderen Rechner/);
  setTafelAnzeige(false);
});

test("SILVIA_ANZEIGE=1 forces the snapshot path", () => {
  assert.equal(wantsForcedAnzeige({ SILVIA_ANZEIGE: "1" }), true);
  assert.equal(wantsForcedAnzeige({ SILVIA_ANZEIGE: "anzeige" }), true);
  assert.equal(wantsForcedAnzeige({}), false);
  assert.equal(wantsForcedAnzeige({ SILVIA_ANZEIGE: "0" }), false);
});
