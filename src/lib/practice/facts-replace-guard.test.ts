import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

type FactRow = { id: string; practice_id: string; fact: string };
type GuardRow = {
  id: string;
  fact: string;
  duplicate: boolean;
  conflict: boolean;
};

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
  await pg.exec(await readFile("migrations/0021_practice_fact_replace_guard.sql", "utf8"));
  const sql = sqlOf(pg);
  await sql.query(
    "insert into practices (id, name, owner_name, email) values ($1, $2, $3, $4), ($5, $6, $7, $8)",
    ["practice-a", "A", "A", "a@example.test", "practice-b", "B", "B", "b@example.test"],
  );
  return { pg, sql };
}

async function facts(sql: ReturnType<typeof sqlOf>) {
  return sql.query<FactRow>(
    "select id, practice_id, fact from practice_facts order by id",
  );
}

async function close(pg: PGlite) {
  await pg.close();
}

test("weist stale B nach A ab und lässt Zieldubletten unverändert", async () => {
  const { pg, sql } = await fixture();
  try {
    await sql.query(
      "insert into practice_facts (id, practice_id, fact) values ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)",
      ["source", "practice-a", "alt", "target-a", "practice-a", "A", "target-b", "practice-a", "B"],
    );
    const first = await sql.query<GuardRow>(
      "select * from replace_practice_fact_guarded($1, $2, $3, $4)",
      ["source", "practice-a", "A", "alt"],
    );
    assert.deepEqual(first, [{ id: "source", fact: "A", duplicate: true, conflict: false }]);

    const beforeStale = await facts(sql);
    const stale = await sql.query<GuardRow>(
      "select * from replace_practice_fact_guarded($1, $2, $3, $4)",
      ["source", "practice-a", "B", "alt"],
    );
    assert.deepEqual(stale, [{ id: "source", fact: "A", duplicate: false, conflict: true }]);
    assert.deepEqual(await facts(sql), beforeStale);
  } finally {
    await close(pg);
  }
});

test("erlaubt denselben gewünschten Wert erneut und lehnt expected null ab", async () => {
  const { pg, sql } = await fixture();
  try {
    await sql.query(
      "insert into practice_facts (id, practice_id, fact) values ($1, $2, $3)",
      ["source", "practice-a", "alt"],
    );
    const first = await sql.query<GuardRow>(
      "select * from replace_practice_fact_guarded($1, $2, $3, $4)",
      ["source", "practice-a", "neu", "alt"],
    );
    const retry = await sql.query<GuardRow>(
      "select * from replace_practice_fact_guarded($1, $2, $3, $4)",
      ["source", "practice-a", "neu", "alt"],
    );
    assert.deepEqual(first, [{ id: "source", fact: "neu", duplicate: false, conflict: false }]);
    assert.deepEqual(retry, first);

    const before = await facts(sql);
    const nullExpected = await sql.query<GuardRow>(
      "select * from replace_practice_fact_guarded($1, $2, $3, $4)",
      ["source", "practice-a", "anderer Wert", null],
    );
    assert.deepEqual(nullExpected, [{ id: "source", fact: "neu", duplicate: false, conflict: true }]);
    assert.deepEqual(await facts(sql), before);
  } finally {
    await close(pg);
  }
});

test("gibt bei fremder oder fehlender Quelle keine Zeile zurück", async () => {
  const { pg, sql } = await fixture();
  try {
    await sql.query(
      "insert into practice_facts (id, practice_id, fact) values ($1, $2, $3), ($4, $5, $6)",
      ["source", "practice-a", "A", "other", "practice-b", "B"],
    );
    assert.deepEqual(
      await sql.query<GuardRow>(
        "select * from replace_practice_fact_guarded($1, $2, $3, $4)",
        ["other", "practice-a", "neu", "B"],
      ),
      [],
    );
    assert.deepEqual(
      await sql.query<GuardRow>(
        "select * from replace_practice_fact_guarded($1, $2, $3, $4)",
        ["missing", "practice-a", "neu", "alt"],
      ),
      [],
    );
  } finally {
    await close(pg);
  }
});

test("serialisiert zwei konkurrierende erwartete Updates", async () => {
  const { pg, sql } = await fixture();
  try {
    await sql.query(
      "insert into practice_facts (id, practice_id, fact) values ($1, $2, $3)",
      ["source", "practice-a", "alt"],
    );
    const results = await Promise.all([
      sql.query<GuardRow>(
        "select * from replace_practice_fact_guarded($1, $2, $3, $4)",
        ["source", "practice-a", "A", "alt"],
      ),
      sql.query<GuardRow>(
        "select * from replace_practice_fact_guarded($1, $2, $3, $4)",
        ["source", "practice-a", "B", "alt"],
      ),
    ]);
    const rows = results.map((result) => result[0]).filter((row): row is GuardRow => Boolean(row));
    assert.equal(rows.length, 2);
    assert.equal(rows.filter((row) => !row.conflict).length, 1);
    assert.equal(rows.filter((row) => row.conflict).length, 1);
    assert.equal(new Set(rows.map((row) => row.id)).size, 1);
    const after = await facts(sql);
    assert.equal(after.length, 1);
    assert.ok(after[0].fact === "A" || after[0].fact === "B");
  } finally {
    await close(pg);
  }
});

test("führt den Merge mit Quell-ID aus und löscht nur im eigenen Mandanten", async () => {
  const { pg, sql } = await fixture();
  try {
    await sql.query(
      "insert into practice_facts (id, practice_id, fact) values ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)",
      [
        "source",
        "practice-a",
        "alt",
        "same-practice-target",
        "practice-a",
        "Neu",
        "other-practice-target",
        "practice-b",
        "Neu",
      ],
    );
    const result = await sql.query<GuardRow>(
      "select * from replace_practice_fact_guarded($1, $2, $3, $4)",
      ["source", "practice-a", "Neu", "alt"],
    );
    assert.deepEqual(result, [{ id: "source", fact: "Neu", duplicate: true, conflict: false }]);
    assert.deepEqual(await facts(sql), [
      { id: "other-practice-target", practice_id: "practice-b", fact: "Neu" },
      { id: "source", practice_id: "practice-a", fact: "Neu" },
    ]);
  } finally {
    await close(pg);
  }
});

test("rollt das Ziel-DELETE bei einem UPDATE-Fehler zurück", async () => {
  const { pg, sql } = await fixture();
  try {
    await sql.query(
      "insert into practice_facts (id, practice_id, fact) values ($1, $2, $3), ($4, $5, $6)",
      ["source", "practice-a", "alt", "target", "practice-a", "Rollbackziel"],
    );
    const before = await facts(sql);
    await sql.query(
      "create function guarded_replace_fail() returns trigger language plpgsql as $$ begin raise exception 'gezielter Guard-Updatefehler'; end $$",
    );
    await sql.query(
      "create trigger guarded_replace_fail_trigger before update on practice_facts for each row when (new.fact = 'Rollbackziel') execute function guarded_replace_fail()",
    );
    await assert.rejects(
      () =>
        sql.query<GuardRow>(
          "select * from replace_practice_fact_guarded($1, $2, $3, $4)",
          ["source", "practice-a", "Rollbackziel", "alt"],
        ),
      /gezielter Guard-Updatefehler/,
    );
    assert.deepEqual(await facts(sql), before);
  } finally {
    await close(pg);
  }
});
