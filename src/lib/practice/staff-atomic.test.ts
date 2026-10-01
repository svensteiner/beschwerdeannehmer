import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

/**
 * Zugaenge (Migration 0028).
 *
 * Zwei Vorgaenge bestanden vorher aus mehreren getrennten Anweisungen:
 *
 *   - Die letzte Inhaberin wurde geschuetzt, indem zuerst gezaehlt und danach
 *     geloescht wurde. Zwei gleichzeitige Loeschungen sahen beide zwei
 *     Inhaberinnen und loeschten beide.
 *   - Beim Passwortsetzen waren Hash und Sitzungswiderruf zwei Schritte. Schlug
 *     der zweite fehl, blieb das neue Passwort gesetzt und die alten Sitzungen
 *     lebten weiter.
 *
 * Beide laufen jetzt in EINER Funktion, also in einer Transaktion. Pruefung und
 * Schreibvorgang liegen damit in derselben Anweisung; die Zugangssperre haelt
 * bis zum Ende.
 *
 * Grenze dieser Pruefung: PGlite hat eine einzige Verbindung, echte
 * Gleichzeitigkeit laesst sich hier nicht fahren. Belegt ist der Vertrag der
 * Funktion (die letzte Inhaberin faellt nie, Passwort und Widerruf passieren
 * zusammen) und dass Pruefung und Schreiben nicht mehr getrennt sind. Ein
 * Mehrverbindungsnachweis auf Postgres steht aus.
 *
 * Eine gemeinsame Datenbank fuer alle Faelle: fuenf PGlite-Instanzen mit je 28
 * Migrationen in einem Prozess erschoepfen den WASM-Speicher. Jeder Fall nutzt
 * eigene Kennungen.
 */

let dbPromise: Promise<PGlite> | null = null;

/**
 * Nur die Migrationen, die diese Funktionen beruehren: das Grundschema und die
 * Zugangs migration. Andere Tests dieses Projekts laden ebenfalls gezielt
 * statt alle 28 - PGlite ist WASM, jede geladene Migration kostet commiteten
 * Speicher, und auf diesem Rechner ist der knapp.
 */
const NEEDED_MIGRATIONS = ["0001_silvia.sql", "0028_staff_atomic.sql"];

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

async function addPractice(pg: PGlite, id: string) {
  await pg.query(
    "insert into practices (id, name, owner_name, email) values ($1,$2,$3,$4)",
    [id, `Ordination ${id}`, `Dr. ${id}`, `${id}@example.test`],
  );
}

async function addUser(pg: PGlite, id: string, role: string, practiceId: string) {
  await pg.query(
    "insert into practice_users (id, practice_id, email, password_hash, name, role) values ($1,$2,$3,$4,$5,$6)",
    [id, practiceId, `${id}@example.test`, `hash-${id}`, id, role],
  );
}

async function addSession(pg: PGlite, id: string, userId: string, token: string) {
  await pg.query(
    "insert into practice_sessions (id, user_id, token_hash, expires_at) values ($1,$2,$3,$4)",
    [id, userId, token, new Date(Date.now() + 86_400_000).toISOString()],
  );
}

async function removeStaff(pg: PGlite, practiceId: string, targetId: string): Promise<string> {
  const rows = await pg.query<{ status: string }>(
    "select remove_practice_staff($1, $2) as status",
    [practiceId, targetId],
  );
  return String(rows.rows[0]?.status ?? "");
}

async function setPassword(
  pg: PGlite,
  userId: string,
  practiceId: string | null,
  hash: string,
  keepToken: string | null,
): Promise<boolean> {
  const rows = await pg.query<{ ok: boolean }>(
    "select set_practice_password($1, $2, $3, $4) as ok",
    [userId, practiceId, hash, keepToken],
  );
  return rows.rows[0]?.ok === true;
}

test("remove_practice_staff schuetzt die letzte Inhaberin", async () => {
  const pg = await db();
  await addPractice(pg, "pa");
  await addUser(pg, "pa-owner", "inhaberin", "pa");
  await addUser(pg, "pa-kassa", "kassa", "pa");

  // Eine Kollegin geht.
  assert.equal(await removeStaff(pg, "pa", "pa-kassa"), "removed");

  // Die letzte Inhaberin bleibt - auch wenn sie es selbst versucht.
  assert.equal(await removeStaff(pg, "pa", "pa-owner"), "last_owner");
  const still = await pg.query<{ n: number }>(
    "select count(*)::int as n from practice_users where id = 'pa-owner'",
  );
  assert.equal(still.rows[0]?.n, 1, "die Inhaberin steht noch");

  // Unbekannte Ziele und fremde Ordinationen aendern nichts.
  assert.equal(await removeStaff(pg, "pa", "gibt-es-nicht"), "not_found");
  assert.equal(await removeStaff(pg, "andere", "pa-owner"), "not_found");
  assert.equal(
    (await pg.query<{ n: number }>("select count(*)::int as n from practice_users where practice_id = 'pa'")).rows[0]?.n,
    1,
    "nur die Inhaberin ist uebrig",
  );
});

test("remove_practice_staff erlaubt das Entfernen, solange eine Inhaberin bleibt", async () => {
  const pg = await db();
  await addPractice(pg, "pb");
  await addUser(pg, "pb-owner-1", "inhaberin", "pb");
  await addUser(pg, "pb-owner-2", "inhaberin", "pb");

  // Zwei Inhaberinnen: die zweite darf gehen.
  assert.equal(await removeStaff(pg, "pb", "pb-owner-2"), "removed");
  // Danach ist die erste die letzte und bleibt.
  assert.equal(await removeStaff(pg, "pb", "pb-owner-1"), "last_owner");
  const owners = await pg.query<{ n: number }>(
    "select count(*)::int as n from practice_users where practice_id = 'pb' and role = 'inhaberin'",
  );
  assert.equal(owners.rows[0]?.n, 1);
});

test("set_practice_password setzt Passwort UND widerruft Sitzungen zusammen", async () => {
  const pg = await db();
  await addPractice(pg, "pc");
  await addUser(pg, "pc-owner", "inhaberin", "pc");
  await addSession(pg, "pc-s1", "pc-owner", "pc-token-1");
  await addSession(pg, "pc-s2", "pc-owner", "pc-token-2");
  await addSession(pg, "pc-s3", "pc-owner", "pc-token-3");

  // Kollegin zuruecksetzen: alle Sitzungen fallen (kein Token bleibt).
  assert.equal(await setPassword(pg, "pc-owner", "pc", "hash-neu", null), true);

  const hash = await pg.query<{ password_hash: string }>(
    "select password_hash from practice_users where id = 'pc-owner'",
  );
  assert.equal(hash.rows[0]?.password_hash, "hash-neu", "das Passwort ist gesetzt");

  const sessions = await pg.query<{ n: number }>(
    "select count(*)::int as n from practice_sessions where user_id = 'pc-owner'",
  );
  assert.equal(sessions.rows[0]?.n, 0, "keine alte Sitzung bleibt");
});

test("set_practice_password laesst die eigene Sitzung bestehen", async () => {
  const pg = await db();
  await addPractice(pg, "pd");
  await addUser(pg, "pd-owner", "inhaberin", "pd");
  await addSession(pg, "pd-s1", "pd-owner", "pd-token-keep");
  await addSession(pg, "pd-s2", "pd-owner", "pd-token-drop");

  // Eigenes Passwort aendern: die eigene Sitzung bleibt, die andere faellt.
  assert.equal(await setPassword(pg, "pd-owner", "pd", "hash-neu", "pd-token-keep"), true);

  const left = await pg.query<{ token_hash: string }>(
    "select token_hash from practice_sessions where user_id = 'pd-owner' order by token_hash",
  );
  assert.deepEqual(left.rows.map((r) => r.token_hash), ["pd-token-keep"]);
});

test("set_practice_password schreibt nicht in eine fremde Ordination", async () => {
  const pg = await db();
  await addPractice(pg, "pe");
  await addPractice(pg, "pf");
  await addUser(pg, "pf-owner", "inhaberin", "pf");
  await addSession(pg, "pf-s1", "pf-owner", "pf-token");

  // Die Praxisbindung muss greifen: sonst koennte eine Sitzung mit falscher
  // practice_id fremde Zugaenge uebernehmen.
  assert.equal(await setPassword(pg, "pf-owner", "pe", "hash-eingedrungen", null), false);

  const hash = await pg.query<{ password_hash: string }>(
    "select password_hash from practice_users where id = 'pf-owner'",
  );
  assert.equal(hash.rows[0]?.password_hash, "hash-pf-owner", "das Passwort ist unveraendert");
  const sessions = await pg.query<{ n: number }>(
    "select count(*)::int as n from practice_sessions where user_id = 'pf-owner'",
  );
  assert.equal(sessions.rows[0]?.n, 1, "die Sitzung lebt weiter");
});
