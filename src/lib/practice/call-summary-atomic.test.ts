import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

/**
 * Anruf-Zusammenfassung (Migration 0030): Punkte 2, 3 und 8.
 *
 * 2. Zusammenfassung und Mailentwurf entstehen in EINER Transaktion. Vorher
 *    waren es zwei Anweisungen: zwei gleichzeitige Laeufe schrieben beide.
 * 3. Schlug der Entwurf nach der Zusammenfassung fehl, sah die
 *    Wiederholungspruefung summary_at und versuchte nie wieder - der Entwurf
 *    fehlte dauerhaft. Jetzt faellt bei einem Fehler alles zurueck.
 * 8. Die Anrufkennung liegt in einer eigenen Spalte statt im Betrefftext.
 *
 * Grenze: PGlite hat eine einzige Verbindung, echte Gleichzeitigkeit laesst
 * sich hier nicht fahren. Belegt ist der Vertrag der Funktion - insbesondere,
 * dass ein Fehler beim Entwurf die Zusammenfassung mit zurueckrollt.
 */

const NEEDED_MIGRATIONS = [
  "0001_silvia.sql",
  "0012_call_summary.sql",
  "0014_call_external_id.sql",
  "0030_call_summary_atomic.sql",
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

async function seedCall(pg: PGlite, practiceId: string, callId: string, externalCallId: string) {
  await pg.query(
    "insert into practices (id, name, owner_name, email) values ($1,$2,$3,$4) on conflict (id) do nothing",
    [practiceId, `Ordination ${practiceId}`, `Dr. ${practiceId}`, `${practiceId}@example.test`],
  );
  await pg.query(
    `insert into calls (id, practice_id, caller, pet, external_call_id, action)
     values ($1,$2,$3,$4,$5,$6)`,
    [callId, practiceId, "Frau Test", "Bella", externalCallId, "Terminwunsch"],
  );
}

async function finalize(
  pg: PGlite,
  callRowId: string,
  callId: string,
  summary = "Anliegen: Impfung\nVereinbart: offen",
  mailId = `mail-${Math.random().toString(36).slice(2)}`,
): Promise<string> {
  const rows = await pg.query<{ status: string }>(
    "select finalize_call_summary($1,$2,$3,$4,$5,$6) as status",
    [callRowId, summary, callId, `Anrufzusammenfassung 01.01.2026 10:00 [${callId}]`, "Text", mailId],
  );
  return String(rows.rows[0]?.status ?? "");
}

test("Punkt 2/8: eine Zusammenfassung wird genau einmal geschrieben", async () => {
  const pg = await db();
  await seedCall(pg, "sa", "sa-call", "ext-sa");

  assert.equal(await finalize(pg, "sa-call", "ext-sa"), "stored");

  const call = await pg.query<{ summary: string; summary_at: Date | null }>(
    "select summary, summary_at from calls where id = 'sa-call'",
  );
  assert.equal(call.rows[0]?.summary, "Anliegen: Impfung\nVereinbart: offen");
  assert.ok(call.rows[0]?.summary_at, "summary_at ist gesetzt");

  // Punkt 8: die Kennung liegt in einer eigenen Spalte.
  const mails = await pg.query<{ call_id: string; subject: string }>(
    "select call_id, subject from mails where practice_id = 'sa'",
  );
  assert.equal(mails.rows.length, 1, "genau ein Entwurf");
  assert.equal(mails.rows[0]?.call_id, "ext-sa", "die Kennung steht in der Spalte");
  assert.match(mails.rows[0]!.subject, /ext-sa/, "und bleibt im Betreff lesbar");

  // Ein zweiter Lauf schreibt nichts mehr.
  assert.equal(await finalize(pg, "sa-call", "ext-sa"), "already");
  const after = await pg.query<{ n: number }>("select count(*)::int as n from mails where practice_id = 'sa'");
  assert.equal(after.rows[0]?.n, 1, "kein zweiter Entwurf");
});

test("Punkt 3: scheitert der Entwurf, faellt die Zusammenfassung mit zurueck", async () => {
  const pg = await db();
  await seedCall(pg, "sb", "sb-call", "ext-sb");

  // Die Tabelle fuer den Entwurf verschwindet: der Insert muss scheitern.
  await pg.exec("alter table mails rename to mails_weg");

  await assert.rejects(() => finalize(pg, "sb-call", "ext-sb"));

  // Genau das war vorher nicht so: summary_at blieb gesetzt und ein spaeterer
  // Lauf versuchte nie wieder.
  const call = await pg.query<{ summary: string; summary_at: Date | null }>(
    "select summary, summary_at from calls where id = 'sb-call'",
  );
  assert.equal(call.rows[0]?.summary_at, null, "summary_at ist NICHT gesetzt");
  assert.equal(call.rows[0]?.summary, "", "und die Zusammenfassung auch nicht");

  // Wiederherstellen: der Lauf holt es nach.
  await pg.exec("alter table mails_weg rename to mails");
  assert.equal(await finalize(pg, "sb-call", "ext-sb"), "stored");
  const ok = await pg.query<{ n: number }>("select count(*)::int as n from mails where practice_id = 'sb'");
  assert.equal(ok.rows[0]?.n, 1, "der Entwurf entsteht beim naechsten Lauf");
});

test("Punkt 1: verschiedene Kennungen erzeugen getrennte Entwuerfe", async () => {
  const pg = await db();
  // Genau der gemeldete Fall: "12" und "3124" duerfen sich nicht gegenseitig
  // blockieren.
  await seedCall(pg, "sc", "sc-call-12", "12");
  await seedCall(pg, "sc", "sc-call-3124", "3124");

  assert.equal(await finalize(pg, "sc-call-12", "12"), "stored");
  assert.equal(await finalize(pg, "sc-call-3124", "3124"), "stored");

  const rows = await pg.query<{ call_id: string }>(
    "select call_id from mails where practice_id = 'sc' order by call_id",
  );
  assert.deepEqual(rows.rows.map((r) => r.call_id), ["12", "3124"], "beide Anrufe haben ihren Entwurf");
});

test("eine unbekannte calls-Zeile aendert nichts", async () => {
  const pg = await db();
  // Punkt 4: -missing- ist von -already- unterscheidbar.
  assert.equal(await finalize(pg, "gibt-es-nicht", "ext-x"), "missing");
  const rows = await pg.query<{ n: number }>(
    "select count(*)::int as n from mails where call_id = 'ext-x'",
  );
  assert.equal(rows.rows[0]?.n, 0, "kein Entwurf ohne Anruf");
});

test("die Kennung bleibt je Ordination eindeutig", async () => {
  const pg = await db();
  await seedCall(pg, "sd", "sd-call-1", "ext-sd");
  await seedCall(pg, "sd", "sd-call-2", "ext-sd");

  await finalize(pg, "sd-call-1", "ext-sd", "Anliegen: A", "mail-sd-1");
  // Der zweite Lauf fuer dieselbe externe Kennung: der Index laesst nur einen
  // Entwurf zu, die Zusammenfassung der zweiten Zeile entsteht trotzdem.
  await finalize(pg, "sd-call-2", "ext-sd", "Anliegen: B", "mail-sd-2");

  const rows = await pg.query<{ n: number }>("select count(*)::int as n from mails where practice_id = 'sd'");
  assert.equal(rows.rows[0]?.n, 1, "nur ein Entwurf je Kennung");
});

test("Punkt 4: ein bestehender Entwurf gilt nicht als voller Erfolg", async () => {
  const pg = await db();
  await seedCall(pg, "sf", "sf-call", "ext-sf");

  // Erster Lauf: Zusammenfassung UND Entwurf.
  assert.equal(await finalize(pg, "sf-call", "ext-sf", "Anliegen: A", "mail-sf-1"), "stored");

  // Ein zweiter Anruf traegt DIESELBE externe Kennung (z.B. Wiederholung des
  // Gateways). Der eindeutige Index laesst keinen zweiten Entwurf zu. Frueher
  // meldete die Funktion trotzdem "stored" - die Zusammenfassung galt als
  // gespeichert, obwohl kein passender Entwurf entstand.
  await seedCall(pg, "sf", "sf-call-2", "ext-sf");
  assert.equal(await finalize(pg, "sf-call-2", "ext-sf", "Anliegen: B", "mail-sf-2"), "already");

  // Und es wurde wirklich nichts geschrieben: keine Zusammenfassung ohne
  // Entwurf, kein Entwurf ohne Zusammenfassung.
  const rows = await pg.query<{ id: string; summary: string; summary_at: Date | null }>(
    "select id, summary, summary_at from calls where practice_id = 'sf' order by id",
  );
  const first = rows.rows.find((r) => r.id === "sf-call");
  const second = rows.rows.find((r) => r.id === "sf-call-2");
  assert.ok(first?.summary_at, "der erste Anruf ist zusammengefasst");
  assert.equal(second?.summary_at, null, "der zweite NICHT");
  assert.equal(second?.summary, "");

  const mails = await pg.query<{ n: number }>("select count(*)::int as n from mails where practice_id = 'sf'");
  assert.equal(mails.rows[0]?.n, 1, "genau ein Entwurf");
});

test("Punkt 4: eine unbekannte calls-Zeile meldet missing", async () => {
  const pg = await db();
  assert.equal(await finalize(pg, "gibt-es-nicht-2", "ext-y"), "missing");
});

test("eine lange Kennung wird unveraendert gespeichert", async () => {
  const pg = await db();
  const lang = `anruf-${"x".repeat(60)}`;
  await seedCall(pg, "se", "se-call", lang);
  assert.equal(await finalize(pg, "se-call", lang), "stored");
  const rows = await pg.query<{ call_id: string }>("select call_id from mails where practice_id = 'se'");
  assert.equal(rows.rows[0]?.call_id, lang, "keine Kuerzung, keine Verwechslung");
});


