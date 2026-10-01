import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { replaceFactAtomically, replaceFactGuarded } from "./facts-replace.ts";

function sqlOf(pg: PGlite) {
  return {
    query: async <T>(text: string, params: unknown[] = []) =>
      (await pg.query<T>(text, params)).rows,
  };
}

async function fixture() {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.exec(await readFile("migrations/0001_silvia.sql", "utf8"));
  await pg.exec(await readFile("migrations/0004_practice_facts.sql", "utf8"));
  await pg.exec(await readFile("migrations/0018_practice_fact_merge_atomic.sql", "utf8"));
  await pg.query("insert into practices (id, name, owner_name, email) values ($1, $2, $3, $4), ($5, $6, $7, $8)", [
    "practice-a", "A", "A", "a@example.test", "practice-b", "B", "B", "b@example.test",
  ]);
  return { pg, sql: sqlOf(pg) };
}

test("replaceFactAtomically bewahrt Quell-ID bei Merge und Retry", async () => {
  const { pg, sql } = await fixture();
  try {
    await sql.query("insert into practice_facts (id, practice_id, fact) values ($1, $2, $3), ($4, $5, $6)", ["source", "practice-b", "Ausgangsregel", "target", "practice-b", "Zielregel"]);
    const first = await replaceFactAtomically(sql, "source", "practice-b", "Zielregel");
    const second = await replaceFactAtomically(sql, "source", "practice-b", "Zielregel");
    assert.deepEqual(first, { id: "source", fact: "Zielregel", duplicate: true });
    assert.deepEqual(second, { id: "source", fact: "Zielregel", duplicate: false });
    assert.deepEqual(await sql.query("select id, practice_id, fact from practice_facts order by id"), [{ id: "source", practice_id: "practice-b", fact: "Zielregel" }]);
  } finally { await pg.close(); }
});

test("replaceFactAtomically schützt fremde und fehlende Quellen", async () => {
  const { pg, sql } = await fixture();
  try {
    await sql.query("insert into practice_facts (id, practice_id, fact) values ($1, $2, $3), ($4, $5, $6)", ["a", "practice-a", "A-Regel", "b", "practice-b", "B-Regel"]);
    const before = await sql.query("select id, practice_id, fact from practice_facts order by id");
    assert.equal(await replaceFactAtomically(sql, "a", "practice-b", "B-Regel"), null);
    assert.equal(await replaceFactAtomically(sql, "missing", "practice-b", "Neue Regel"), null);
    assert.deepEqual(await sql.query("select id, practice_id, fact from practice_facts order by id"), before);
  } finally { await pg.close(); }
});

test("replaceFactAtomically rollt DELETE zurück, wenn UPDATE fehlschlägt", async () => {
  const { pg, sql } = await fixture();
  try {
    await sql.query("insert into practice_facts (id, practice_id, fact) values ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)", ["source", "practice-b", "Ausgangsregel", "target", "practice-b", "Rollbackziel", "a", "practice-a", "A-Regel"]);
    const before = await sql.query("select id, practice_id, fact from practice_facts order by id");
    await sql.query("create function facts_replace_fail() returns trigger language plpgsql as $$ begin raise exception 'gezielter Updatefehler'; end $$");
    await sql.query("create trigger facts_replace_fail_trigger before update on practice_facts for each row when (new.fact = 'Rollbackziel') execute function facts_replace_fail()");
    await assert.rejects(() => replaceFactAtomically(sql, "source", "practice-b", "Rollbackziel"), /gezielter Updatefehler/);
    assert.deepEqual(await sql.query("select id, practice_id, fact from practice_facts order by id"), before);
  } finally { await pg.close(); }
});

test("replaceFactGuarded übergibt den erwarteten Originaltext", async () => {
  let seen: { query: string; params: unknown[] } | undefined;
  const sql = {
    query: async (query: string, params: unknown[]) => {
      seen = { query, params };
      return [{ id: "source", fact: "Neue Regel", duplicate: false, conflict: false }];
    },
  };
  const row = await replaceFactGuarded(sql as Pick<Sql, "query">, "source", "practice-a", "Neue Regel", "Alte Regel");
  assert.equal(row?.conflict, false);
  assert.match(seen?.query ?? "", /replace_practice_fact_guarded/);
  assert.deepEqual(seen?.params, ["source", "practice-a", "Neue Regel", "Alte Regel"]);
});
