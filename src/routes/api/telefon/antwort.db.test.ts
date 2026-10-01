import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { completePhoneCall } from "@/lib/practice/call-completion";

/**
 * AP 59 (Turn-Idempotenz + Anruf-Ende-Status): prueft die beiden DB-Vertraege
 * der neuen Migration 0031 gegen eine bare PGlite-Instanz.
 *
 * 1. Der eindeutige Index calls_idempotency_key_idx erzwingt, dass ein
 *    Gateway-Retry (gleiche practice_id + gleicher idempotency_key) keine
 *    zweite calls-Zeile anlegt — "on conflict do nothing" ist die letzte
 *    Verteidigung, wenn zwei gleiche Turns gleichzeitig ankommen.
 * 2. Der Abschluss-Ping setzt status='erledigt' und traegt eine echte
 *    duration_sec nach (statt des hartcodierten Platzhalters 38).
 */

const NEEDED_MIGRATIONS = [
  "0001_silvia.sql",
  "0014_call_external_id.sql",
  "0034_call_idempotency.sql",
];

let dbPromise: Promise<PGlite> | null = null;

function db(): Promise<PGlite> {
  dbPromise ??= (async () => {
    const pg = new PGlite();
    await pg.waitReady;
    for (const name of NEEDED_MIGRATIONS) {
      await pg.exec(await readFile(join(process.cwd(), "migrations", name), "utf8"));
    }
    return pg;
  })();
  return dbPromise;
}

test("eindeutiger Index verhindert doppelte calls-Zeile fuer denselben Turn", async () => {
  const pg = await db();
  await pg.query(
    "insert into practices (id, name, owner_name, email) values ($1,$2,$3,$4) on conflict (id) do nothing",
    ["p-idem", "Ordination", "Dr. Test", "test@example.test"],
  );

  // Zwei gleichzeitige Turns desselben Anrufs mit demselben Schluessel.
  const insertTurn = (rowId: string, key: string) =>
    pg.query(
      `insert into calls (id, practice_id, caller, pet, idempotency_key)
       values ($1, $2, $3, $4, $5)
       on conflict (practice_id, idempotency_key) do nothing`,
      [rowId, "p-idem", "Frau Test", "Bella", key],
    );

  await insertTurn("c-idem-1", "gw-1#1");
  await insertTurn("c-idem-2", "gw-1#1"); // Retry desselben Turns -> Konflikt.

  const rows = await pg.query<{ id: string; idempotency_key: string | null }>(
    "select id, idempotency_key from calls where practice_id = 'p-idem' order by id",
  );
  assert.equal(rows.rows.length, 1, "nur eine Zeile je Turn");
  assert.equal(rows.rows[0]!.id, "c-idem-1");

  // Ein anderer Turn (andere Nummer) ist KEIN Konflikt.
  await insertTurn("c-idem-3", "gw-1#2");
  const after = await pg.query<{ id: string }>(
    "select id from calls where practice_id = 'p-idem' order by id",
  );
  assert.equal(after.rows.length, 2);

  // NULL-Schluessel (Web-/sonstige Zeile ohne callId) wird nicht erfasst.
  await pg.query(
    `insert into calls (id, practice_id, caller, pet, idempotency_key)
     values ($1, $2, $3, $4, null)`,
    ["c-idem-4", "p-idem", "Frau Test", "Bella"],
  );
  await pg.query(
    `insert into calls (id, practice_id, caller, pet, idempotency_key)
     values ($1, $2, $3, $4, null)`,
    ["c-idem-5", "p-idem", "Frau Test", "Bella"],
  );
  const nullRows = await pg.query<{ n: number }>(
    "select count(*)::int as n from calls where practice_id = 'p-idem' and idempotency_key is null",
  );
  assert.equal(nullRows.rows[0]!.n, 2, "NULL-Schluessel duerfen sich wiederholen");
});

test("Produktionsabschluss erledigt alle Turns, aber nur diese Praxis und Anruf-ID", async () => {
  const pg = await db();
  await pg.query(
    "insert into practices (id, name, owner_name, email) values ($1,$2,$3,$4) on conflict (id) do nothing",
    ["p-other", "Andere Ordination", "Dr. Andere", "other@example.test"],
  );
  await pg.query(
    `insert into calls (id, practice_id, caller, pet, status, duration_sec, external_call_id, at)
     values
       ('c-multi-1', 'p-idem', 'Frau Test', 'Bella', 'offen', 0, 'gw-multi', now() - interval '3 minutes'),
       ('c-multi-2', 'p-idem', 'Frau Test', 'Bella', 'offen', 0, 'gw-multi', now() - interval '1 minute'),
       ('c-other-call', 'p-idem', 'Frau Test', 'Bella', 'offen', 0, 'gw-other', now() - interval '2 minutes'),
       ('c-other-practice', 'p-other', 'Frau Andere', 'Minka', 'offen', 0, 'gw-multi', now() - interval '4 minutes')`,
  );

  // SQL-Adapter auf die synthetische DB; die getestete Funktion ist dieselbe,
  // die beide Produktionspfade beim Anrufende aufrufen.
  const sql = {
    query: <T>(text: string, params: unknown[] = []) => pg.query<T>(text, params).then((result) => result.rows),
  } as Sql;
  await completePhoneCall(sql, "c-multi-1", "gw-multi");

  const rows = await pg.query<{ id: string; status: string; duration_sec: number }>(
    "select id, status, duration_sec from calls where id like 'c-multi-%' or id in ('c-other-call', 'c-other-practice') order by id",
  );
  assert.deepEqual(rows.rows.map(({ id, status }) => [id, status]), [
    ["c-multi-1", "erledigt"],
    ["c-multi-2", "erledigt"],
    ["c-other-call", "offen"],
    ["c-other-practice", "offen"],
  ]);
  assert.ok(rows.rows[0]!.duration_sec >= 0);
  assert.equal(rows.rows[0]!.duration_sec, rows.rows[1]!.duration_sec, "beide Turn-Zeilen zeigen die Gesamtdauer des Anrufs");
  assert.equal(rows.rows[2]!.duration_sec, 0);
  assert.equal(rows.rows[3]!.duration_sec, 0);
});
