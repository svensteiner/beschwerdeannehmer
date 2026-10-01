import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { sqlIsAnzeigeAllowed, sqlIsReadOnly } from "../pglite-anzeige.ts";
import { rememberPracticeFactAtomically } from "./facts-create.ts";
import { replaceFactAtomically } from "./facts-replace.ts";

function sqlOf(pg: PGlite): Sql {
  const run = async <T>(text: string, params: unknown[] = []) =>
    (await pg.query<T>(text, params)).rows;
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  }) as unknown as Sql;
  sql.query = run;
  return sql;
}

test("atomare Fakten-Schreibfunktionen werden als Schreibabfrage klassifiziert", () => {
  const query = "select * from remember_practice_fact_atomic($1, $2, $3)";
  assert.equal(sqlIsReadOnly(query), false);
  assert.equal(sqlIsAnzeigeAllowed(query), false);
  const mergeQuery = "select * from replace_practice_fact_atomic($1, $2, $3)";
  assert.equal(sqlIsReadOnly(mergeQuery), false);
  assert.equal(sqlIsAnzeigeAllowed(mergeQuery), false);
  const guardedQuery = "select * from replace_practice_fact_guarded($1, $2, $3, $4)";
  assert.equal(sqlIsReadOnly(guardedQuery), false);
  assert.equal(sqlIsAnzeigeAllowed(guardedQuery), false);
});

async function fixture() {
  const pg = new PGlite();
  await pg.waitReady;
  for (const file of ["0001_silvia.sql", "0004_practice_facts.sql", "0017_practice_fact_create_atomic.sql", "0018_practice_fact_merge_atomic.sql"])
    await pg.exec(await readFile(`migrations/${file}`, "utf8"));
  await pg.query("insert into practices (id, name, owner_name, email) values ($1, $2, $3, $4)", [
    "practice-a", "A", "A", "a@example.test",
  ]);
  return { pg, sql: sqlOf(pg) };
}

// Baseline reproducer for the former SELECT-then-INSERT implementation.
async function formerNonAtomicCreate(sql: Sql, practiceId: string, fact: string) {
  const rows = await sql.query<{ id: string; fact: string }>(
    "select id, fact from practice_facts where practice_id = $1 order by created_at desc limit 40",
    [practiceId],
  );
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  if (rows.some((r) => r.fact.toLowerCase() === fact.toLowerCase())) return;
  if (rows.length >= 40) return;
  await sql.query("insert into practice_facts (id, practice_id, fact) values ($1, $2, $3)", [crypto.randomUUID(), practiceId, fact]);
}

test("Repro: alte getrennte Prüfung überschreitet bei 39 plus 2 das Limit", async () => {
  const { pg, sql } = await fixture();
  try {
    await Promise.all(Array.from({ length: 39 }, (_, i) =>
      sql.query("insert into practice_facts (id, practice_id, fact) values ($1, $2, $3)", [crypto.randomUUID(), "practice-a", `Alte Regel ${i} ist wichtig.`])));
    await Promise.all([
      formerNonAtomicCreate(sql, "practice-a", "Alte Zusatzregel 40."),
      formerNonAtomicCreate(sql, "practice-a", "Alte Zusatzregel 41."),
    ]);
    assert.equal((await sql.query("select count(*)::int as count from practice_facts"))[0].count, 41);
  } finally { await pg.close(); }
});

test("konkurrierte identische Fakten ergeben genau einen Datensatz", async () => {
  const { pg, sql } = await fixture();
  try {
    const results = await Promise.all(
      Array.from({ length: 40 }, () => rememberPracticeFactAtomically(sql, "practice-a", "Nur vormittags impfen.", crypto.randomUUID())),
    );
    assert.equal(results.filter((r) => r.ok && r.duplicate === false).length, 1);
    assert.ok(results.every((r) => r.ok));
    assert.equal(new Set(results.filter((r) => r.ok).map((r) => r.id)).size, 1);
    assert.equal((await sql.query("select count(*)::int as count from practice_facts"))[0].count, 1);
  } finally { await pg.close(); }
});

test("konkurrierte Fakten halten das Praxislimit von 40 ein", async () => {
  const { pg, sql } = await fixture();
  try {
    await Promise.all(Array.from({ length: 39 }, (_, i) =>
      rememberPracticeFactAtomically(sql, "practice-a", `Regel Nummer ${i} ist wichtig.`, crypto.randomUUID())));
    const results = await Promise.all([
      rememberPracticeFactAtomically(sql, "practice-a", "Zusatzregel Nummer 40.", crypto.randomUUID()),
      rememberPracticeFactAtomically(sql, "practice-a", "Zusatzregel Nummer 41.", crypto.randomUUID()),
    ]);
    assert.equal(results.filter((r) => r.ok && r.duplicate === false).length, 1);
    assert.equal(results.filter((r) => !r.ok).length, 1);
    assert.equal((await sql.query("select count(*)::int as count from practice_facts"))[0].count, 40);
    const duplicateAtCapacity = await rememberPracticeFactAtomically(sql, "practice-a", "Regel Nummer 0 ist wichtig.", crypto.randomUUID());
    assert.equal(duplicateAtCapacity.ok, true);
    if (duplicateAtCapacity.ok) assert.equal(duplicateAtCapacity.duplicate, true);
  } finally { await pg.close(); }
});

test("Faktenlimits bleiben je Praxis getrennt", async () => {
  const { pg, sql } = await fixture();
  try {
    await sql.query("insert into practices (id, name, owner_name, email) values ($1, $2, $3, $4)", ["practice-b", "B", "B", "b@example.test"]);
    const [a, b] = await Promise.all([
      rememberPracticeFactAtomically(sql, "practice-a", "Praxisübergreifende Regel.", crypto.randomUUID()),
      rememberPracticeFactAtomically(sql, "practice-b", "Praxisübergreifende Regel.", crypto.randomUUID()),
    ]);
    assert.equal(a.ok && a.duplicate, false);
    assert.equal(b.ok && b.duplicate, false);
  } finally { await pg.close(); }
});

test("konkurrierendes Create und Merge hinterlassen genau die Quell-ID", async () => {
  const { pg, sql } = await fixture();
  try {
    await sql.query("insert into practice_facts (id, practice_id, fact) values ($1, $2, $3)", ["source", "practice-a", "Ausgangsregel"]);
    const createPromise = rememberPracticeFactAtomically(sql, "practice-a", "Zielregel", "created");
    const mergePromise = replaceFactAtomically(sql, "source", "practice-a", "Zielregel");
    const [created, merged] = await Promise.all([createPromise, mergePromise]);
    assert.equal(created.ok, true);
    assert.equal(merged?.id, "source");
    assert.equal(merged?.fact, "Zielregel");
    assert.equal((await sql.query("select count(*)::int as count from practice_facts where practice_id = $1", ["practice-a"]))[0].count, 1);
    assert.deepEqual(await sql.query("select id, fact from practice_facts where practice_id = $1", ["practice-a"]), [{ id: "source", fact: "Zielregel" }]);
  } finally { await pg.close(); }
});
