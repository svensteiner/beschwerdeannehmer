import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  HOER_LOG_CAP,
  LEGACY_HOER_MAX_BYTES,
  MEMORY_HOER_LOG,
  appendHoerKorrektur,
  correctedPhrasesForPractice,
  correctedPhrasesFromDb,
  hoerLogPath,
  importLegacyHoerKorrekturen,
  isMeaningfulCorrection,
  readHoerLog,
  saveHoerKorrektur,
  type HoerKorrekturEntry,
} from "./hoer-log.ts";
import { speechPracticeId } from "./speech-scope.ts";
import { hoerCorrectionSignature, requestIdForSignature } from "./hoer-correction.ts";

const migrationDir = fileURLToPath(new URL("../../../migrations/", import.meta.url));
async function applyHoerMigrations(db: PGlite) {
  await db.exec("create table practices (id text primary key)");
  await db.exec("insert into practices (id) values ('praxis-a'), ('praxis-b')");
  await db.exec(await readFile(join(migrationDir, "0015_hoer_korrekturen.sql"), "utf8"));
  await db.exec(await readFile(join(migrationDir, "0016_hoer_korrektur_request_id.sql"), "utf8"));
  await db.exec(await readFile(join(migrationDir, "0019_hoer_korrektur_atomic.sql"), "utf8"));
  await db.exec(await readFile(join(migrationDir, "0022_hoer_legacy_cap.sql"), "utf8"));
}

test("UI-Korrektur-ID bleibt beim Retry gleich, bei anderem Payload neu", () => {
  const base = { lineId: "user-1", callGeneration: 3, heard: "Rontgen", corrected: "Röntgen" };
  const signature = hoerCorrectionSignature(base);
  const first = requestIdForSignature(null, signature, () => "uuid-1");
  assert.deepEqual(requestIdForSignature(first, signature, () => "uuid-2"), first);
  const changed = requestIdForSignature(null, hoerCorrectionSignature({ ...base, corrected: "Röntgenbild" }), () => "uuid-3");
  assert.equal(changed.requestId, "uuid-3");
  const newTurn = requestIdForSignature(first, hoerCorrectionSignature({ ...base, callGeneration: 4 }), () => "uuid-4");
  assert.equal(newTurn.requestId, "uuid-4");
});

test("isMeaningfulCorrection: false if heard and corrected are equal ignoring case/whitespace/punctuation", () => {
  assert.equal(isMeaningfulCorrection("Mittwoch nur Kastration.", "mittwoch  nur kastration"), false);
  assert.equal(isMeaningfulCorrection("Grüß Gott!", "grüß gott"), false);
});

test("isMeaningfulCorrection: false if corrected is empty", () => {
  assert.equal(isMeaningfulCorrection("irgendwas", ""), false);
  assert.equal(isMeaningfulCorrection("irgendwas", "   "), false);
});

test("isMeaningfulCorrection: true when the texts actually differ", () => {
  assert.equal(isMeaningfulCorrection("Mittwoch nur Kastration", "Mittwoch nur Kastrationen"), true);
  assert.equal(isMeaningfulCorrection("Doktor Uber", "Doktor Huber"), true);
});

test("correctedPhrasesForPractice: liefert nur die eigenen Praxisbegriffe", () => {
  const entries: HoerKorrekturEntry[] = [
    { ...makeEntry("Fip", "FIP"), practiceId: "praxis-a" },
    { ...makeEntry("Huber", "HÃ¼ber"), practiceId: "praxis-b" },
    { ...makeEntry("Op", "OP"), practiceId: "praxis-a" },
    makeEntry("alte Demo", "darf nicht erscheinen"),
  ];
  assert.deepEqual(correctedPhrasesForPractice(entries, "praxis-a"), ["FIP", "OP"]);
  assert.deepEqual(correctedPhrasesForPractice(entries, "praxis-b"), ["HÃ¼ber"]);
  assert.deepEqual(correctedPhrasesForPractice(entries), []);
});

test("synthetische Praxisräume bleiben bei Sprachkorrekturen und Demo getrennt", async () => {
  const root = await mkdtemp(join(tmpdir(), "silvia-hoer-tenants-"));
  try {
    const a = join(root, "praxis-a.jsonl");
    const b = join(root, "praxis-b.jsonl");
    assert.equal(speechPracticeId(false, "praxis-a"), "praxis-a");
    assert.equal(speechPracticeId(true, "praxis-a"), undefined);
    await appendHoerKorrektur({ ...makeEntry("Fip", "FIP"), practiceId: "praxis-a" }, a);
    await appendHoerKorrektur({ ...makeEntry("Fip", "Fiep"), practiceId: "praxis-b" }, b);
    const fromA = await readHoerLog(a);
    const fromB = await readHoerLog(b);
    assert.deepEqual(correctedPhrasesForPractice(fromA, "praxis-a"), ["FIP"]);
    assert.deepEqual(correctedPhrasesForPractice(fromA, "praxis-b"), []);
    assert.deepEqual(correctedPhrasesForPractice(fromB, "praxis-a"), []);
    assert.deepEqual(correctedPhrasesForPractice(fromB, "praxis-b"), ["Fiep"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("hoerLogPath: SILVIA_DATA_DIR or the .silvia-data default", () => {
  assert.equal(
    hoerLogPath({ SILVIA_DATA_DIR: "/tmp/foo" }),
    "/tmp/foo/silvia-hoer-korrekturen.jsonl",
  );
  assert.equal(
    hoerLogPath({ SILVIA_DATA_DIR: "/tmp/foo/" }),
    "/tmp/foo/silvia-hoer-korrekturen.jsonl",
  );
  assert.equal(hoerLogPath({}), ".silvia-data/silvia-hoer-korrekturen.jsonl");
  assert.equal(hoerLogPath({ SILVIA_DATA_DIR: "memory" }), MEMORY_HOER_LOG);
  for (const value of ["memory://", ":memory:", " MEMORY:// "]) {
    assert.equal(hoerLogPath({ SILVIA_DATA_DIR: value }), MEMORY_HOER_LOG);
  }
});

function makeEntry(heard: string, corrected: string): HoerKorrekturEntry {
  return { ts: new Date().toISOString(), heard, corrected };
}

test("appendHoerKorrektur + readHoerLog: round trip, creates the dir, skips bad lines", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silvia-hoer-log-"));
  try {
    const path = join(dir, "nested", "silvia-hoer-korrekturen.jsonl");
    assert.equal(await appendHoerKorrektur(makeEntry("Doktor Uber", "Doktor Huber"), path), true);
    assert.equal(await appendHoerKorrektur(makeEntry("Kastration", "Kastrationen"), path), true);

    const raw = await readFile(path, "utf8");
    assert.ok(raw.trim().length > 0);

    const entries = await readHoerLog(path);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].corrected, "Doktor Huber");
    assert.equal(entries[1].corrected, "Kastrationen");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("appendHoerKorrektur: never throws on an unwritable path", async () => {
  await assert.doesNotReject(() =>
    appendHoerKorrektur(
      makeEntry("egal", "wurscht"),
      "\0invalid\0path/silvia-hoer-korrekturen.jsonl",
    ),
  );
});

test("readHoerLog: missing file returns an empty array", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silvia-hoer-log-missing-"));
  try {
    const entries = await readHoerLog(join(dir, "does-not-exist.jsonl"));
    assert.deepEqual(entries, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("legacy JSONL imports once into its named practice and never assigns an unknown practice", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silvia-hoer-db-import-"));
  const path = join(dir, "silvia-hoer-korrekturen.jsonl");
  const db = new PGlite();
  await db.waitReady;
  try {
    await db.exec("create table practices (id text primary key)");
    await db.exec("create table hoer_legacy_imports (source_key text primary key, imported_at timestamptz not null)");
    await db.exec(await readFile(join(migrationDir, "0022_hoer_legacy_cap.sql"), "utf8"));
    await db.exec("insert into practices (id) values ('praxis-a')");
    const sql = { query: async <T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> => (await db.query(text, params)).rows as T[] };
    await writeFile(path, [
      JSON.stringify({ ts: "2026-09-11T09:00:00.000Z", heard: "Rontgen", corrected: "Röntgen", practiceId: "praxis-a" }),
      JSON.stringify({ ts: "2026-09-11T09:00:00.000Z", heard: "Alt", corrected: "Fremd", practiceId: "unbekannt" }),
    ].join("\n"), "utf8");
    await assert.rejects(importLegacyHoerKorrekturen(sql, path));
    const markerRows = await db.query<{ count: number }>("select count(*)::int as count from hoer_legacy_imports");
    assert.equal(markerRows.rows[0].count, 0);
    await db.exec("create table hoer_corrections (id text primary key, practice_id text not null, heard text not null, corrected text not null, created_at timestamptz not null, legacy_key text unique null)");
    const imports = await Promise.all([importLegacyHoerKorrekturen(sql, path), importLegacyHoerKorrekturen(sql, path)]);
    assert.deepEqual(imports.sort(), [0, 1]);
    await db.exec("delete from hoer_corrections where practice_id = 'praxis-a'");
    await db.exec("insert into practices (id) values ('unbekannt')");
    assert.equal(await importLegacyHoerKorrekturen(sql, path), 0);
    assert.deepEqual(await correctedPhrasesFromDb(sql, "praxis-a"), []);
    assert.deepEqual(await correctedPhrasesFromDb(sql, "unbekannt"), []);
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("legacy import rejects overflow atomically and retries after capacity is available", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silvia-hoer-db-import-cap-"));
  const path = join(dir, "silvia-hoer-korrekturen.jsonl");
  const db = new PGlite();
  await db.waitReady;
  try {
    await applyHoerMigrations(db);
    const sql = { query: async <T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> => (await db.query(text, params)).rows as T[] };
    await db.query("insert into hoer_corrections (id, practice_id, heard, corrected, created_at, request_id) select 'seed-' || i, 'praxis-a', 'h' || i, 'c' || i, now(), 'seed-r' || i from generate_series(0, $1::int - 1) i", [HOER_LOG_CAP - 1]);
    await writeFile(path, [
      JSON.stringify({ ts: "2026-09-11T09:00:00.000Z", heard: "Alt 1", corrected: "Neu 1", practiceId: "praxis-a" }),
      JSON.stringify({ ts: "2026-09-11T09:00:00.000Z", heard: "Alt 2", corrected: "Neu 2", practiceId: "praxis-a" }),
      JSON.stringify({ ts: "2026-09-11T09:00:00.000Z", heard: "Alt B", corrected: "Neu B", practiceId: "praxis-b" }),
    ].join("\n"), "utf8");
    const sourceBefore = await readFile(path, "utf8");
    await assert.rejects(importLegacyHoerKorrekturen(sql, path), /Grenze von 2000/);
    const rows = await db.query<{ count: number }>("select count(*)::int as count from hoer_corrections where practice_id = 'praxis-a'");
    assert.equal(rows.rows[0].count, HOER_LOG_CAP - 1);
    assert.deepEqual(await correctedPhrasesFromDb(sql, "praxis-b"), []);
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from hoer_legacy_imports")).rows[0].count, 0);
    assert.equal(await readFile(path, "utf8"), sourceBefore);
    await db.query("delete from hoer_corrections where id = 'seed-0'");
    assert.equal(await importLegacyHoerKorrekturen(sql, path), 3);
    assert.deepEqual(await correctedPhrasesFromDb(sql, "praxis-b"), ["Neu B"]);
    assert.equal(await importLegacyHoerKorrekturen(sql, path), 0);
    const afterRetry = await db.query<{ count: number }>("select count(*)::int as count from hoer_corrections where practice_id = 'praxis-a'");
    assert.equal(afterRetry.rows[0].count, HOER_LOG_CAP);
    assert.equal(await readFile(path, "utf8"), sourceBefore);
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("legacy import and normal correction keep the 2000 cap in both observed SQL start orders", async () => {
  // PGlite has one local connection, so this is deliberately not presented as
  // two independent PostgreSQL connections.  The small gate instead makes both
  // application calls reach their real `sql.query` boundary.  For the import,
  // that boundary is after its awaited JSONL read and payload construction.
  const run = async (first: "import" | "save") => {
    const dir = await mkdtemp(join(tmpdir(), `silvia-hoer-race-${first}-`));
    const path = join(dir, "silvia-hoer-korrekturen.jsonl");
    const db = new PGlite();
    await db.waitReady;
    try {
      await applyHoerMigrations(db);
      await db.query("insert into hoer_corrections (id, practice_id, heard, corrected, created_at, request_id) select 'seed-' || i, 'praxis-a', 'h' || i, 'c' || i, now(), 'seed-r' || i from generate_series(0, $1::int - 1) i", [HOER_LOG_CAP - 1]);
      await writeFile(path, JSON.stringify({ ts: "2026-09-11T09:00:00.000Z", heard: "Alt", corrected: "Legacy", practiceId: "praxis-a" }), "utf8");

      let importArrived!: () => void;
      let saveArrived!: () => void;
      let firstDbCall!: () => void;
      const importAtSql = new Promise<void>((resolve) => { importArrived = resolve; });
      const saveAtSql = new Promise<void>((resolve) => { saveArrived = resolve; });
      const firstDbStarted = new Promise<void>((resolve) => { firstDbCall = resolve; });
      const sqlCalls: string[] = [];
      const dbCalls: string[] = [];
      const sql = {
        query: async <T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> => {
          const kind = text.includes("import_hoer_legacy_atomic") ? "import" : "save";
          sqlCalls.push(kind);
          // This also proves that the import has parsed the synthetic file
          // before its SQL call: its JSON payload now contains that one row.
          if (kind === "import") {
            const payload = JSON.parse(String(params?.[2] ?? "[]")) as Array<{ corrected?: string }>;
            assert.deepEqual(payload.map((row) => row.corrected), ["Legacy"]);
            importArrived();
          } else {
            saveArrived();
          }
          if (kind === first) {
            await (kind === "import" ? saveAtSql : importAtSql);
            dbCalls.push(kind);
            firstDbCall();
          } else {
            await firstDbStarted;
            dbCalls.push(kind);
          }
          return (await db.query(text, params)).rows as T[];
        },
      };

      const entry = { ts: "2026-09-11T09:01:00.000Z", heard: "Neu", corrected: "Normal", practiceId: "praxis-a", requestId: `normal-${first}` };
      let importPromise: Promise<number>;
      let savePromise: Promise<boolean>;
      // Start the second operation only once the first has reached its actual
      // SQL call. For import this necessarily follows its asynchronous read.
      // The gate above then keeps both operations in flight at that boundary.
      if (first === "import") {
        importPromise = importLegacyHoerKorrekturen(sql, path);
        await importAtSql;
        savePromise = saveHoerKorrektur(sql, entry);
        await saveAtSql;
      } else {
        savePromise = saveHoerKorrektur(sql, entry);
        await saveAtSql;
        importPromise = importLegacyHoerKorrekturen(sql, path);
        await importAtSql;
      }
      const outcomes = await Promise.allSettled([importPromise, savePromise]);
      assert.deepEqual(sqlCalls, [first, first === "import" ? "save" : "import"]);
      assert.deepEqual(dbCalls, sqlCalls);
      const count = (await db.query<{ count: number }>("select count(*)::int as count from hoer_corrections where practice_id = 'praxis-a'")).rows[0].count;
      assert.equal(count, HOER_LOG_CAP);
      if (first === "import") {
        assert.deepEqual(outcomes.map((outcome) => outcome.status === "fulfilled" ? outcome.value : "rejected"), [1, false]);
        assert.equal((await db.query<{ count: number }>("select count(*)::int as count from hoer_legacy_imports")).rows[0].count, 1);
      } else {
        assert.equal(outcomes[0].status, "rejected");
        assert.match(String((outcomes[0] as PromiseRejectedResult).reason), /Grenze von 2000/);
        assert.equal(outcomes[1].status, "fulfilled");
        assert.equal((outcomes[1] as PromiseFulfilledResult<boolean>).value, true);
        assert.equal((await db.query<{ count: number }>("select count(*)::int as count from hoer_legacy_imports")).rows[0].count, 0);
      }
    } finally {
      await db.close();
      await rm(dir, { recursive: true, force: true });
    }
  };
  await run("import");
  await run("save");
});

test("oversized legacy file is rejected before any SQL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silvia-hoer-oversize-"));
  const path = join(dir, "synthetic.jsonl");
  try {
    await writeFile(path, Buffer.alloc(LEGACY_HOER_MAX_BYTES + 1, 32));
    let calls = 0;
    const sql = { query: async <T>(): Promise<T[]> => { calls++; return []; } };
    await assert.rejects(importLegacyHoerKorrekturen(sql, path), /größer als 2 MiB/);
    assert.equal(calls, 0);
    assert.equal((await readFile(path)).length, LEGACY_HOER_MAX_BYTES + 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("appendHoerKorrektur: caps at HOER_LOG_CAP entries, ignores appends beyond that", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silvia-hoer-log-cap-"));
  try {
    const path = join(dir, "silvia-hoer-korrekturen.jsonl");
    const lines = Array.from({ length: HOER_LOG_CAP }, (_, i) =>
      JSON.stringify(makeEntry(`Zeile ${i}`, `Korrigiert ${i}`)),
    ).join("\n");
    await writeFile(path, `${lines}\n`, "utf8");

    await appendHoerKorrektur(makeEntry("sollte", "verworfen werden"), path);

    const entries = await readHoerLog(path);
    assert.equal(entries.length, HOER_LOG_CAP);
    assert.ok(!entries.some((e) => e.corrected === "verworfen werden"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("saveHoerKorrektur: idempotent, concurrent, tenant-bound and rejects payload conflicts", async () => {
  const db = new PGlite();
  await db.waitReady;
  try {
    await applyHoerMigrations(db);
    const sql = { query: async <T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> => (await db.query(text, params)).rows as T[] };
    const entry = { ts: "2026-09-11T09:00:00.000Z", heard: "Rontgen", corrected: "Röntgen", practiceId: "praxis-a" };
    const retryResults = await Promise.all([
      saveHoerKorrektur(sql, { ...entry, requestId: "same-request" }),
      saveHoerKorrektur(sql, { ...entry, requestId: "same-request" }),
    ]);
    assert.deepEqual(retryResults.sort(), [true, true]);
    const countRows = await db.query<{ count: number }>("select count(*)::int as count from hoer_corrections");
    assert.equal(countRows.rows[0].count, 1);
    assert.equal(await saveHoerKorrektur(sql, { ...entry, corrected: "Röntgenbild", requestId: "same-request" }), false);
    assert.equal(await saveHoerKorrektur(sql, { ...entry, practiceId: "praxis-b", requestId: "same-request" }), true);
    const capDb = new PGlite();
    await capDb.waitReady;
    try {
      await applyHoerMigrations(capDb);
      const capSql = { query: async <T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> => (await capDb.query(text, params)).rows as T[] };
      await capDb.query("insert into hoer_corrections (id, practice_id, heard, corrected, created_at, request_id) select 'id-' || i, 'praxis-a', 'h' || i, 'c' || i, now(), 'r' || i from generate_series(0, $1::int - 1) i", [HOER_LOG_CAP]);
      assert.equal(await saveHoerKorrektur(capSql, { ...entry, heard: "h0", corrected: "c0", requestId: "r0" }), true);
      assert.equal(await saveHoerKorrektur(capSql, { ...entry, heard: "h0", corrected: "other", requestId: "r0" }), false);
    } finally { await capDb.close(); }
  } finally { await db.close(); }
});

test("saveHoerKorrektur: two different requests at the cap admit exactly one", async () => {
  const db = new PGlite();
  await db.waitReady;
  try {
    await applyHoerMigrations(db);
    const sql = { query: async <T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> => (await db.query(text, params)).rows as T[] };
    await db.query("insert into hoer_corrections (id, practice_id, heard, corrected, created_at, request_id) select 'seed-' || i, 'praxis-a', 'h' || i, 'c' || i, now(), 'seed-r' || i from generate_series(0, $1::int - 1) i", [HOER_LOG_CAP - 1]);
    const base = { ts: "2026-09-11T09:00:00.000Z", practiceId: "praxis-a" };
    const results = await Promise.all([
      saveHoerKorrektur(sql, { ...base, heard: "Rontgen 1", corrected: "Röntgen 1", requestId: "11111111-1111-4111-8111-111111111111" }),
      saveHoerKorrektur(sql, { ...base, heard: "Rontgen 2", corrected: "Röntgen 2", requestId: "22222222-2222-4222-8222-222222222222" }),
    ]);
    assert.deepEqual(results.sort(), [false, true]);
    const rows = await db.query<{ count: number }>("select count(*)::int as count from hoer_corrections where practice_id = 'praxis-a'");
    assert.equal(rows.rows[0].count, HOER_LOG_CAP);
  } finally {
    await db.close();
  }
});

test("saveHoerKorrektur: unbekannte Praxis wird abgelehnt und schreibt keine Zeile", async () => {
  const db = new PGlite();
  await db.waitReady;
  try {
    await applyHoerMigrations(db);
    const sql = { query: async <T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> => (await db.query(text, params)).rows as T[] };
    assert.equal(await saveHoerKorrektur(sql, { ...makeEntry("unbekannt", "unbekannt"), practiceId: "praxis-nicht-vorhanden" }), false);
    const rows = await db.query<{ count: number }>("select count(*)::int as count from hoer_corrections");
    assert.equal(rows.rows[0].count, 0);
  } finally { await db.close(); }
});
