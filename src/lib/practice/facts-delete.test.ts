import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { deleteFactGuarded } from "./facts-delete.ts";

function sqlOf(pg: PGlite): Sql {
  const run = async <T>(text: string, params: unknown[] = []) =>
    (await pg.query<T>(text, params)).rows;
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) {
      text += `$${index + 1}${strings[index + 1]}`;
    }
    return run(text, values);
  }) as unknown as Sql;
  sql.query = run;
  return sql;
}

async function fixture() {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.exec(await readFile("migrations/0001_silvia.sql", "utf8"));
  await pg.exec(await readFile("migrations/0004_practice_facts.sql", "utf8"));
  const sql = sqlOf(pg);
  await sql.query(
    "insert into practices (id, name, owner_name, email) values ($1, $2, $3, $4), ($5, $6, $7, $8)",
    ["practice-a", "A", "A", "a@example.test", "practice-b", "B", "B", "b@example.test"],
  );
  return { pg, sql };
}

async function factRows(sql: Sql) {
  return sql.query<{ id: string; practice_id: string; fact: string }>(
    "select id, practice_id, fact from practice_facts order by id",
  );
}

test("löscht einen passenden Fakt atomar", async () => {
  const { pg, sql } = await fixture();
  try {
    await sql.query(
      "insert into practice_facts (id, practice_id, fact) values ($1, $2, $3)",
      ["fact-a", "practice-a", "Lokale Regel"],
    );
    assert.equal(await deleteFactGuarded(sql, "fact-a", "practice-a", "Lokale Regel"), true);
    assert.deepEqual(await factRows(sql), []);
  } finally {
    await pg.close();
  }
});

test("weist einen stale expected-Wert nach Änderung ab", async () => {
  const { pg, sql } = await fixture();
  try {
    await sql.query(
      "insert into practice_facts (id, practice_id, fact) values ($1, $2, $3)",
      ["fact-a", "practice-a", "Neue Regel"],
    );
    assert.equal(await deleteFactGuarded(sql, "fact-a", "practice-a", "Alte Regel"), false);
    assert.deepEqual(await factRows(sql), [
      { id: "fact-a", practice_id: "practice-a", fact: "Neue Regel" },
    ]);
  } finally {
    await pg.close();
  }
});

test("schützt Fakten einer fremden Praxis und fehlende IDs", async () => {
  const { pg, sql } = await fixture();
  try {
    await sql.query(
      "insert into practice_facts (id, practice_id, fact) values ($1, $2, $3), ($4, $5, $6)",
      ["fact-a", "practice-a", "A", "fact-b", "practice-b", "B"],
    );
    assert.equal(await deleteFactGuarded(sql, "fact-b", "practice-a", "B"), false);
    assert.equal(await deleteFactGuarded(sql, "missing", "practice-a", "A"), false);
    assert.deepEqual(await factRows(sql), [
      { id: "fact-a", practice_id: "practice-a", fact: "A" },
      { id: "fact-b", practice_id: "practice-b", fact: "B" },
    ]);
  } finally {
    await pg.close();
  }
});

test("liefert bei doppeltem Löschen genau einmal true", async () => {
  const { pg, sql } = await fixture();
  try {
    await sql.query(
      "insert into practice_facts (id, practice_id, fact) values ($1, $2, $3)",
      ["fact-a", "practice-a", "Einmalig"],
    );
    assert.equal(await deleteFactGuarded(sql, "fact-a", "practice-a", "Einmalig"), true);
    assert.equal(await deleteFactGuarded(sql, "fact-a", "practice-a", "Einmalig"), false);
  } finally {
    await pg.close();
  }
});
