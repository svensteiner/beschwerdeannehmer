import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { purgeExpired, PURGE_BATCH_SIZE } from "./retention.ts";

function sqlOf(pg: PGlite): Sql {
  const run = async <T>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  }) as unknown as Sql;
  sql.query = run;
  return sql;
}

test("purgeExpired uses real schema and isolates retention per practice", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  try {
  const dir = join(process.cwd(), "migrations");
  for (const name of (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort()) await pg.exec(await readFile(join(dir, name), "utf8"));
  const sql = sqlOf(pg);
  const now = new Date("2026-09-12T12:00:00.000Z");
  const day = 86400000;
  const old = new Date(now.getTime() - 31 * day).toISOString();
  const boundary = new Date(now.getTime() - 30 * day).toISOString();
  const recent = new Date(now.getTime() - 5 * day).toISOString();
  await sql.query("insert into practices (id,name,owner_name,email,retention_days) values ($1,$2,$3,$4,$5),($6,$7,$8,$9,$10)", ["a","Praxis A","A","a@example.test",30,"b","Praxis B","B","b@example.test",90]);
  await sql.query("insert into patients (id,practice_id,name) values ($1,$2,$3),($4,$5,$6)", ["pa","a","Patient A","pb","b","Patient B"]);
  await sql.query("insert into appointments (id,practice_id,start_at,owner_name,pet) values ($1,$2,$3,$4,$5),($6,$7,$8,$9,$10)", ["aa","a",old,"Owner A","Pet A","ab","b",old,"Owner B","Pet B"]);
  await sql.query("insert into practice_facts (id,practice_id,fact) values ($1,$2,$3),($4,$5,$6)", ["fa","a","Fact A","fb","b","Fact B"]);
  await sql.query("insert into hoer_corrections (id,practice_id,heard,corrected,created_at) values ($1,$2,$3,$4,$5),($6,$7,$8,$9,$10)", ["ha","a","heard","corrected",old,"hb","b","heard","corrected",old]);
  for (const [id, practice, at] of [["ca-old","a",old],["ca-boundary","a",boundary],["ca-new","a",recent],["cb-old","b",old],["cb-new","b",recent]]) {
    await sql.query("insert into calls (id,practice_id,at,caller,pet) values ($1,$2,$3,$4,$5)", [id,practice,at,"Caller","Pet"]);
    // updated_at wie in der Realitaet: ein frisch angelegter, nie ergaenzter
    // Verlauf hat denselben Zeitpunkt wie seine Anlage.
    await sql.query("insert into threads (id,practice_id,name,created_at,updated_at) values ($1,$2,$3,$4,$5)", [`t-${id}`,practice,"Thread",at,at]);
    await sql.query("insert into mails (id,practice_id,at,to_addr,subject,body) values ($1,$2,$3,$4,$5,$6)", [`m-${id}`,practice,at,"x@example.test","Subject","Body"]);
  }
  // Punkt 19: alt angelegt, gestern ergaenzt — darf NICHT verschwinden.
  await sql.query(
    "insert into threads (id,practice_id,name,created_at,updated_at) values ($1,$2,$3,$4,$5),($6,$7,$8,$9,$10)",
    ["t-touched","a","Spaet ergaenzt",old,recent,"t-touched-b","b","Spaet ergaenzt",old,recent],
  );
  const protectedBefore = {
    patients: await sql.query("select * from patients order by id"),
    appointments: await sql.query("select * from appointments order by id"),
    facts: await sql.query("select * from practice_facts order by id"),
    corrections: await sql.query("select * from hoer_corrections order by id"),
  };
  const expiringTables = ["calls", "threads", "mails"] as const;
  const expiringBefore = await Promise.all(expiringTables.map((table) => sql.query<{ id: string }>(`select * from ${table} order by id`)));
  assert.deepEqual(await purgeExpired(sql, now), { practices: 2, failed: 0, calls: 1, threads: 1, mails: 1 });
  for (const [index, table] of expiringTables.entries()) {
    const expected = expiringBefore[index].filter((row) => !["ca-old", "t-ca-old", "m-ca-old"].includes(row.id));
    assert.deepEqual(await sql.query(`select * from ${table} order by id`), expected, table);
  }  const checks: Array<[string, string[]]> = [
    ["calls", ["ca-boundary", "ca-new", "cb-new", "cb-old"]],
    // Punkt 19: t-touched bleibt, obwohl es vor 31 Tagen angelegt wurde.
    ["threads", ["t-ca-boundary", "t-ca-new", "t-cb-new", "t-cb-old", "t-touched", "t-touched-b"]],
    ["mails", ["m-ca-boundary", "m-ca-new", "m-cb-new", "m-cb-old"]],
  ];
  for (const [table, ids] of checks) {
    const rows = await sql.query<{ id: string }>(`select id from ${table} order by id`);
    assert.deepEqual(rows.map((row) => row.id), ids, table);
  }
  assert.equal((await sql.query<{ n: number }>("select count(*)::int as n from patients"))[0].n, 2);
  assert.equal((await sql.query<{ n: number }>("select count(*)::int as n from appointments"))[0].n, 2);
  assert.deepEqual(await sql.query("select * from patients order by id"), protectedBefore.patients);
  assert.deepEqual(await sql.query("select * from appointments order by id"), protectedBefore.appointments);
  assert.deepEqual(await sql.query("select * from practice_facts order by id"), protectedBefore.facts);
  assert.deepEqual(await sql.query("select * from hoer_corrections order by id"), protectedBefore.corrections);
  } finally {
    await pg.close();
  }
});

test("Punkt 19: eine spaet ergaenzte Nachricht verlaengert die Frist", async () => {
  const pg = await freshDb();
  try {
    const sql = sqlOf(pg);
    const now = new Date("2026-09-12T12:00:00.000Z");
    const day = 86400000;
    const old = new Date(now.getTime() - 100 * day).toISOString();
    await sql.query("insert into practices (id,name,owner_name,email,retention_days) values ($1,$2,$3,$4,$5)", ["p", "Praxis", "P", "p@example.test", 90]);
    // Ein vor 100 Tagen begonnener Verlauf.
    await sql.query(
      "insert into threads (id,practice_id,name,preview,messages,created_at,updated_at) values ($1,$2,$3,$4,$5::jsonb,$6,$7)",
      ["th-lang", "p", "Langer Verlauf", "alt", JSON.stringify([{ text: "erste Nachricht" }]), old, old],
    );

    // Der Trigger: jede Aenderung setzt updated_at auf jetzt.
    await sql.query(
      "update threads set preview = $2, messages = $3::jsonb where id = $1",
      ["th-lang", "neu", JSON.stringify([{ text: "erste Nachricht" }, { text: "gestern ergaenzt" }])],
    );
    const row = await sql.query<{ updated_at: Date; created_at: Date }>(
      "select updated_at, created_at from threads where id = 'th-lang'",
    );
    assert.ok(
      new Date(row[0]!.updated_at).getTime() > new Date(row[0]!.created_at).getTime(),
      "updated_at wandert nach vorn",
    );

    // Mit der aktuellen Aktivitaet liegt der Verlauf innerhalb der Frist.
    const result = await purgeExpired(sql, new Date());
    assert.equal(result.threads, 0, "der ergaenzte Verlauf bleibt erhalten");

    // Ohne die Ergaenzung waere er geloescht worden: genau das war der Fehler.
    const still = await sql.query<{ n: number }>("select count(*)::int as n from threads where id = 'th-lang'");
    assert.equal(still[0]?.n, 1);
  } finally {
    await pg.close();
  }
});

test("Punkt 19: der Rueckfall auf created_at funktioniert ohne die neue Spalte", async () => {
  const pg = await freshDb();
  try {
    const sql = sqlOf(pg);
    const now = new Date("2026-09-12T12:00:00.000Z");
    const old = new Date(now.getTime() - 100 * 86400000).toISOString();
    await sql.query("insert into practices (id,name,owner_name,email,retention_days) values ($1,$2,$3,$4,$5)", ["q", "Praxis", "Q", "q@example.test", 90]);
    await sql.query("insert into threads (id,practice_id,name,created_at) values ($1,$2,$3,$4)", ["th-alt", "q", "Alt", old]);

    // Eine aeltere Datenbank ohne die Migration: die Spalte fehlt.
    await sql.query("alter table threads drop column updated_at");

    const logs: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    let result;
    try {
      result = await purgeExpired(sql, now);
    } finally {
      console.error = originalError;
    }

    // Die Bereinigung bleibt wirksam statt als Ganzes zu scheitern.
    assert.equal(result.failed, 0);
    assert.equal(result.threads, 1, "mit Rueckfall wird trotzdem geloescht");
    assert.match(logs.join("\n"), /Rueckfall auf created_at/);
  } finally {
    await pg.close();
  }
});

async function freshDb() {
  const pg = new PGlite();
  await pg.waitReady;
  const dir = join(process.cwd(), "migrations");
  for (const name of (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort()) {
    await pg.exec(await readFile(join(dir, name), "utf8"));
  }
  return pg;
}

test("grosse Loeschmengen werden portionsweise bearbeitet", async () => {
  const pg = await freshDb();
  try {
    const sql = sqlOf(pg);
    const now = new Date("2026-09-12T12:00:00.000Z");
    const old = new Date(now.getTime() - 200 * 86400000).toISOString();
    await sql.query("insert into practices (id,name,owner_name,email,retention_days) values ($1,$2,$3,$4,$5)", ["batch", "Praxis Batch", "B", "batch@example.test", 30]);
    // Deutlich mehr als eine Portion, damit die Schleife mehrfach laeuft.
    const total = PURGE_BATCH_SIZE * 2 + 201;
    for (let start = 0; start < total; start += 500) {
      const size = Math.min(500, total - start);
      await sql.query(
        `insert into calls (id, practice_id, at, caller, pet)
         select 'batch-' || g, 'batch', $1::timestamptz, 'Caller', 'Pet'
           from generate_series($2::int, $3::int) g`,
        [old, start + 1, start + size],
      );
    }
    const before = await sql.query<{ n: number }>("select count(*)::int as n from calls where practice_id = 'batch'");
    assert.equal(before[0].n, total, "Ausgangsmenge");

    const result = await purgeExpired(sql, now);

    assert.equal(result.calls, total, "alle Portionen zusammen ergeben die Gesamtmenge");
    assert.equal(result.failed, 0);
    const after = await sql.query<{ n: number }>("select count(*)::int as n from calls where practice_id = 'batch'");
    assert.equal(after[0].n, 0, "nichts bleibt liegen");
  } finally {
    await pg.close();
  }
});

test("ein Fehler bei einer Ordination stoppt die anderen nicht", async () => {
  const pg = await freshDb();
  try {
    const now = new Date("2026-09-12T12:00:00.000Z");
    const old = new Date(now.getTime() - 200 * 86400000).toISOString();
    const real = sqlOf(pg);
    const base = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      let text = strings[0];
      for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
      return real.query(text, values);
    };
    base.query = real.query;
    // Die zweite Ordination scheitert beim Loeschen.
    const wrapped = base as Sql;
    wrapped.query = async <T>(text: string, params: unknown[] = []) => {
      if (params[0] === "fail-me" && /delete from/i.test(text)) throw new Error("Datenbank nicht erreichbar");
      return real.query<T>(text, params);
    };
    await wrapped.query("insert into practices (id,name,owner_name,email,retention_days) values ($1,$2,$3,$4,$5),($6,$7,$8,$9,$10)", ["ok-one", "Praxis Eins", "A", "eins@example.test", 30, "fail-me", "Praxis Zwei", "Z", "zwei@example.test", 30]);
    for (const [id, practice] of [["k1", "ok-one"], ["k2", "ok-one"], ["f1", "fail-me"]]) {
      await wrapped.query("insert into calls (id,practice_id,at,caller,pet) values ($1,$2,$3,$4,$5)", [id, practice, old, "Caller", "Pet"]);
    }

    const logs: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
    let result;
    try {
      result = await purgeExpired(wrapped, now);
    } finally {
      console.error = originalError;
    }

    // Die gesunde Ordination wird vollstaendig bereinigt.
    assert.equal(result.calls, 2, "die andere Ordination laeuft weiter");
    assert.equal(result.failed, 1, "die gescheiterte Ordination wird gezaehlt");
    assert.equal(result.practices, 2);
    const left = await real.query<{ id: string }>("select id from calls order by id");
    assert.deepEqual(left.map((row) => row.id), ["f1"], "nur die gescheiterte Ordination behaelt ihre Zeilen");

    // Punkt 17: das Protokoll enthaelt keine ungefilterte Fehlermeldung.
    assert.equal(logs.length, 1, "genau eine Meldung");
    assert.match(logs[0], /retention/);
    assert.ok(!/Datenbank nicht erreichbar/.test(logs[0]), "kein Fehlertext mit moeglichen Nutzdaten");
    assert.ok(!/delete from/i.test(logs[0]), "keine fehlerhafte Anweisung im Protokoll");
  } finally {
    await pg.close();
  }
});
