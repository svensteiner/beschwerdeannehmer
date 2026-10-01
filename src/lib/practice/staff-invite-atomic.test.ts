import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { recordStaffAction, sanitizeStaffAuditAction } from "./staff-audit.ts";

/**
 * Zugaenge (Migration 0029): Grenze, doppelte E-Mail und Aenderungsprotokoll.
 *
 * Punkt 1: Zaehlen und Anlegen waren getrennt; zwei gleichzeitige Einladungen
 * sahen beide sieben Zugaenge und legten beide an.
 * Punkt 3: Die Sperre wirkt je Praxis. Dieselbe Adresse in zwei Ordinationen
 * bestand beide Pruefungen und scheiterte erst am unique-Index mit einer rohen
 * Datenbankmeldung.
 * Punkt 4: Ein fehlgeschlagenes Protokoll wurde still ignoriert.
 *
 * Grenze: PGlite hat eine einzige Verbindung, echte Gleichzeitigkeit laesst sich
 * hier nicht fahren. Belegt ist der Vertrag der Funktion und dass ein
 * E-Mail-Konflikt als verstaendlicher Status zurueckkommt statt als Ausnahme.
 */

const NEEDED_MIGRATIONS = ["0001_silvia.sql", "0029_staff_invite_atomic.sql"];

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

async function addPractice(pg: PGlite, id: string) {
  await pg.query(
    "insert into practices (id, name, owner_name, email) values ($1,$2,$3,$4)",
    [id, `Ordination ${id}`, `Dr. ${id}`, `${id}@example.test`],
  );
}

async function invite(
  pg: PGlite,
  practiceId: string,
  userId: string,
  email: string,
  maxStaff = 8,
): Promise<string> {
  const rows = await pg.query<{ status: string }>(
    "select invite_practice_staff($1,$2,$3,$4,$5,$6,$7) as status",
    [practiceId, userId, userId, email, "hash", "kassa", maxStaff],
  );
  return String(rows.rows[0]?.status ?? "");
}

test("invite_practice_staff legt an und meldet den vollen Zugang", async () => {
  const pg = await db();
  await addPractice(pg, "ia");

  assert.equal(await invite(pg, "ia", "ia-1", "ia-1@example.test"), "invited");
  const rows = await pg.query<{ n: number }>(
    "select count(*)::int as n from practice_users where practice_id = 'ia'",
  );
  assert.equal(rows.rows[0]?.n, 1);

  // Grenze erreicht: hier bewusst mit kleinem Limit.
  await addPractice(pg, "ib");
  assert.equal(await invite(pg, "ib", "ib-1", "ib-1@example.test", 1), "invited");
  assert.equal(await invite(pg, "ib", "ib-2", "ib-2@example.test", 1), "full");
  const zwei = await pg.query<{ n: number }>(
    "select count(*)::int as n from practice_users where practice_id = 'ib'",
  );
  assert.equal(zwei.rows[0]?.n, 1, "die Grenze wurde nicht ueberschritten");
});

test("dieselbe E-Mail in zwei Ordinationen wird verstaendlich abgewiesen", async () => {
  const pg = await db();
  await addPractice(pg, "ic");
  await addPractice(pg, "id");

  assert.equal(await invite(pg, "ic", "ic-1", "gleich@example.test"), "invited");
  // Punkt 3: KEINE Ausnahme, sondern ein Status. Vorher kam hier ein roher
  // unique-Index-Fehler aus der Datenbank.
  assert.equal(await invite(pg, "id", "id-1", "gleich@example.test"), "email_taken");

  const rows = await pg.query<{ n: number }>(
    "select count(*)::int as n from practice_users where email = 'gleich@example.test'",
  );
  assert.equal(rows.rows[0]?.n, 1, "die Adresse bleibt einmalig");
});

test("practice_staff_audit nimmt Aktionen auf und lehnt Unbekanntes ab", async () => {
  const pg = await db();
  await addPractice(pg, "ie");
  await pg.query(
    "insert into practice_users (id, practice_id, email, password_hash, name, role) values ($1,$2,$3,$4,$5,$6)",
    ["ie-owner", "ie", "ie-owner@example.test", "hash", "Inhaberin", "inhaberin"],
  );
  const sql = sqlOf(pg);

  // Punkt 6: eine Aktion wird nachvollziehbar gespeichert.
  assert.equal(
    await recordStaffAction(sql, {
      practiceId: "ie",
      actorId: "ie-owner",
      action: "invited",
      targetId: "ie-2",
      targetEmail: "  Neu@Example.test ",
    }),
    true,
  );
  const row = await pg.query<{ action: string; target_email: string; actor_id: string }>(
    "select action, target_email, actor_id from practice_staff_audit where practice_id = 'ie'",
  );
  assert.equal(row.rows[0]?.action, "invited");
  assert.equal(row.rows[0]?.target_email, "neu@example.test", "Adresse normalisiert");
  assert.equal(row.rows[0]?.actor_id, "ie-owner", "wer es getan hat, steht dabei");

  // Kein Passwort, kein Hash im Protokoll.
  const spalten = await pg.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_name = 'practice_staff_audit'",
  );
  const namen = spalten.rows.map((r) => r.column_name).join(",");
  assert.ok(!/password|hash|token|code/i.test(namen), `keine Geheimnisspalte: ${namen}`);

  // Punkt 4: eine unbekannte Aktion wird nicht gespeichert und gilt als nicht
  // protokolliert.
  assert.equal(sanitizeStaffAuditAction("irgendwas"), null);
  assert.equal(sanitizeStaffAuditAction(""), null);
  assert.equal(
    await recordStaffAction(sql, { practiceId: "ie", actorId: "ie-owner", action: "irgendwas" as never }),
    false,
  );
  const nachher = await pg.query<{ n: number }>(
    "select count(*)::int as n from practice_staff_audit where practice_id = 'ie'",
  );
  assert.equal(nachher.rows[0]?.n, 1, "nur der gueltige Eintrag steht da");

  // Ein Fehler beim Protokollieren wirft nicht, sondern meldet false.
  // recordStaffAction nutzt die Tagged-Template-Form, deshalb muss die
  // aufgerufene Funktion selbst scheitern - nicht nur `.query`.
  const kaputt = (async () => {
    throw new Error("Tabelle weg");
  }) as unknown as Sql;
  kaputt.query = async () => {
    throw new Error("Tabelle weg");
  };
  const originalError = console.error;
  const logs: string[] = [];
  console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
  let gemeldet: boolean;
  try {
    gemeldet = await recordStaffAction(kaputt, {
      practiceId: "ie",
      actorId: "ie-owner",
      action: "removed",
    });
  } finally {
    console.error = originalError;
  }
  assert.equal(gemeldet, false);
  // Punkt 4: der Fehlschlag ist sichtbar, nicht still.
  assert.equal(logs.length, 1);
  assert.match(logs[0]!, /staff-audit/);
  assert.ok(!/example\.test/.test(logs[0]!), "keine Adresse im Protokoll");
});
