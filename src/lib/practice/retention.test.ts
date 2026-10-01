import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { purgeExpired } from "./retention.ts";

/** Minimal Sql adapter over a bare PGlite instance — same shape as db.ts's toSql(). */
function sqlOf(pg: PGlite): Sql {
  const run = async <T>(text: string, params: unknown[]) => {
    const res = await pg.query<T>(text, params);
    return res.rows;
  };
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  }) as unknown as Sql;
  sql.query = (text: string, params: unknown[] = []) => run(text, params);
  return sql;
}

const CREATE_TABLES = [
  "create table practices (id text primary key, retention_days integer not null default 90)",
  "create table calls (id text primary key, practice_id text not null, at timestamptz not null)",
  "create table threads (id text primary key, practice_id text not null, created_at timestamptz not null)",
  "create table mails (id text primary key, practice_id text not null, at timestamptz not null)",
];

async function seed(pg: PGlite) {
  for (const stmt of CREATE_TABLES) await pg.query(stmt);
}

test("purgeExpired deletes rows older than retention_days and keeps recent ones", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  await seed(pg);
  const sql = sqlOf(pg);

  await sql`insert into practices (id, retention_days) values (${"p1"}, ${30})`;
  const now = new Date("2026-09-01T12:00:00.000Z");
  const old = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString(); // 40d ago > 30d
  const recent = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5d ago

  await sql`insert into calls (id, practice_id, at) values (${"c-old"}, ${"p1"}, ${old})`;
  await sql`insert into calls (id, practice_id, at) values (${"c-new"}, ${"p1"}, ${recent})`;
  await sql`insert into threads (id, practice_id, created_at) values (${"t-old"}, ${"p1"}, ${old})`;
  await sql`insert into threads (id, practice_id, created_at) values (${"t-new"}, ${"p1"}, ${recent})`;
  await sql`insert into mails (id, practice_id, at) values (${"m-old"}, ${"p1"}, ${old})`;
  await sql`insert into mails (id, practice_id, at) values (${"m-new"}, ${"p1"}, ${recent})`;

  const result = await purgeExpired(sql, now);
  assert.deepEqual(result, { practices: 1, failed: 0, calls: 1, threads: 1, mails: 1 });

  const calls = await sql<{ id: string }>`select id from calls`;
  assert.deepEqual(calls.map((r) => r.id), ["c-new"]);
  const threads = await sql<{ id: string }>`select id from threads`;
  assert.deepEqual(threads.map((r) => r.id), ["t-new"]);
  const mails = await sql<{ id: string }>`select id from mails`;
  assert.deepEqual(mails.map((r) => r.id), ["m-new"]);

  await pg.close();
});

test("purgeExpired leaves everything when nothing is older than retention_days", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  await seed(pg);
  const sql = sqlOf(pg);

  await sql`insert into practices (id, retention_days) values (${"p1"}, ${365})`;
  const now = new Date("2026-09-01T12:00:00.000Z");
  const recent = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
  await sql`insert into calls (id, practice_id, at) values (${"c-new"}, ${"p1"}, ${recent})`;

  const result = await purgeExpired(sql, now);
  assert.equal(result.calls, 0);
  const calls = await sql<{ id: string }>`select id from calls`;
  assert.equal(calls.length, 1);

  await pg.close();
});
