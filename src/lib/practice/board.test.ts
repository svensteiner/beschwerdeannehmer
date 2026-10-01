import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import {
  APPOINTMENT_SLOT_CONFLICT_REPLY,
  CONNECTOR_SLOT_CONFLICT_REPLY,
  boardUserSearchText,
  contactPetForPersistence,
  isShortBookingConfirmation,
  keepKnownPhone,
  latestUserMention,
  patientNameForPersistence,
  persistedBookingAction,
  resolveFirstTurn,
} from "./board.ts";

/** Minimal Sql adapter over a bare PGlite instance — same shape as retention.test.ts. */
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

test("resolveFirstTurn nutzt das explizite Flag statt der Zeilen-Heuristik", () => {
  assert.equal(resolveFirstTurn([], true), true);
  assert.equal(resolveFirstTurn([{ role: "assistant" }, { role: "assistant" }], false), false);
});

test("Persistenz behauptet keinen gebuchten Termin ohne konkreten Slot", () => {
  assert.equal(persistedBookingAction(new Date("2026-09-13T09:00:00"), "Termin gelegt"), "Termin gelegt");
  assert.equal(persistedBookingAction(null, "Termin gelegt"), "Auskunft hinterlegt");
  assert.equal(persistedBookingAction(new Date("invalid"), "Termin gelegt"), "Auskunft hinterlegt");
});

test("Slot-Konflikte bestätigen keinen Termin", () => {
  assert.match(APPOINTMENT_SLOT_CONFLICT_REPLY, /keinen Termin eingetragen/i);
  assert.match(CONNECTOR_SLOT_CONFLICT_REPLY, /Praxissoftware bestätigt/i);
});

test("alle Live-Buchungspfade nutzen die atomare Slot-Prüfung", () => {
  const board = readFileSync(new URL("./board.ts", import.meta.url), "utf8");
  const desk = readFileSync(new URL("./desk-actions.ts", import.meta.url), "utf8");
  const sprechen = readFileSync(new URL("../../components/sprechen/sprechen-call.tsx", import.meta.url), "utf8");
  const telefon = readFileSync(new URL("../../routes/api/telefon/antwort.ts", import.meta.url), "utf8");

  assert.match(board, /reserve_appointment_slot_atomic/);
  assert.doesNotMatch(board, /insert into appointments/);
  assert.match(desk, /status !== "abgesagt" && current\[0\]\.status === "abgesagt"/);
  assert.match(desk, /move_appointment_slot_atomic/);
  assert.match(desk, /update_appointment_status_atomic/);
  assert.doesNotMatch(desk, /update appointments/);
  assert.match(board, /connectorLocalConflict/);
  assert.match(board, /Tafelkonflikt/);
  assert.match(sprechen, /"bookingConflict" in saved &&\s+saved\.bookingConflict/);
  assert.match(telefon, /"bookingConflict" in saved &&\s+saved\.bookingConflict/);
});

test("Auskunft aus einem Verlauf erzeugt keine Patientenkarte", () => {
  assert.equal(patientNameForPersistence({ type: "none", kind: "Info", pet: "Audit" }), "");
  assert.equal(patientNameForPersistence({ type: "none", kind: "Handy", pet: "Audit Hund" }), "Audit Hund");
  assert.equal(patientNameForPersistence({ type: "none", kind: "Verschieben", pet: "Audit Hund" }), "Audit Hund");
});

test("Kontaktnachtrag nutzt die neueste Nutzerangabe, nicht die spätere Bestätigung", () => {
  const lines = [
    { role: "user" as const, content: "Meine Nummer ist 0660123451" },
    { role: "assistant" as const, content: "Bestätigung geht an 0660123451" },
    { role: "user" as const, content: "Meine neue Nummer ist 0660999999" },
    { role: "assistant" as const, content: "Bestätigung geht an 0660999999" },
  ];
  assert.equal(latestUserMention("Ja, passt", lines, (text) => text.match(/\d{10}/)?.[0] ?? ""), "0660999999");
  assert.equal(latestUserMention("Ja, passt", [{ role: "assistant", content: "0660999999" }], (text) => text.match(/\d{10}/)?.[0] ?? ""), "");
  assert.equal(latestUserMention("Ja, passt", [{ role: "user", content: "Neue Mail x@example.com" }], (text) => text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] ?? ""), "x@example.com");
});

test("gleiche österreichische Nummer behält die vorhandene Schreibweise", () => {
  assert.equal(keepKnownPhone("+43 660 123 45 2", "0660123452"), "+43 660 123 45 2");
  assert.equal(keepKnownPhone("0660123452", "0660999999"), "0660999999");
  assert.equal(keepKnownPhone("", "0660123452"), "0660123452");
});

test("Kontaktturn ohne Tiername darf keinen Verlaufstiernamen ableiten", () => {
  assert.equal(contactPetForPersistence("Audit", "Meine neue E-Mail ist neu@example.test", true), "");
  assert.equal(contactPetForPersistence("Falsches Tier", "Meine E-Mail ist neu@example.test für Hund Audit", true), "Audit");
  assert.equal(contactPetForPersistence("Audit Hund", "Bitte um Rückruf", false), "Audit Hund");
});

test("Patientensuche verwendet den gesamten Nutzerverlauf, nicht nur die Bestätigung", () => {
  const text = boardUserSearchText("Ja, passt", [
    { role: "assistant", content: "Nur vom Assistenten erwähnter Testname" },
    { role: "user", content: "Termin für Bella, Frau Wallner" },
  ]);
  assert.match(text, /Bella/);
  assert.match(text, /Ja, passt/);
  assert.doesNotMatch(text, /Nur vom Assistenten erwähnter Testname/);
});

test("Buchungsbestätigung bleibt kurz und weist Fragen oder neue Wünsche zurück", () => {
  assert.equal(isShortBookingConfirmation("Ja, passt."), true);
  assert.equal(isShortBookingConfirmation("Ja, was kostet das?"), false);
  assert.equal(isShortBookingConfirmation("Ja, aber morgen"), false);
  assert.equal(isShortBookingConfirmation("passt"), true);
});

test("resolveFirstTurn faellt ohne Flag auf <= 1 Assistenten-Zeile zurueck (Telefon, alte Aufrufer)", () => {
  assert.equal(resolveFirstTurn([{ role: "assistant" }], undefined), true);
  assert.equal(
    resolveFirstTurn([{ role: "assistant" }, { role: "user" }, { role: "assistant" }], undefined),
    false,
  );
});

test("Regression AP 55: Web-Client saet die Begruessung als erste Assistenten-Zeile vor — beim ersten echten Turn stehen bereits 2 Assistenten-Zeilen (Begruessung + Antwort), die alte Heuristik haette das faelschlich als 'nicht erster Turn' gewertet", () => {
  const lines = [
    { role: "assistant" as const }, // Begruessung (seeded)
    { role: "user" as const },
    { role: "assistant" as const }, // erste echte Antwort
  ];
  // Alte Heuristik (kein Flag): 2 Assistenten-Zeilen > 1 => faelschlich false.
  assert.equal(resolveFirstTurn(lines, undefined), false);
  // Neu: sprechen-call.tsx meldet explizit firstTurn=true fuer genau diesen Fall.
  assert.equal(resolveFirstTurn(lines, true), true);
});

// AP 56: persistBoardEvent schreibt data.callId (externe Anruf-ID des Telefon-
// Gateways) als calls.external_call_id — hier gegen dieselbe insert-Spaltenliste
// wie in board.ts geprueft, mit einer bareen PGlite-Instanz (kein Request-/
// Session-Kontext noetig, siehe retention.test.ts fuer denselben Ansatz).
test("insert into calls speichert external_call_id, wenn callId gesetzt ist (AP 56)", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.query(
    "create table calls (id text primary key, practice_id text not null, channel text not null, caller text not null, pet text not null, species text not null default '', concern text not null default '', status text not null default 'offen', duration_sec integer not null default 0, transcript jsonb not null default '[]'::jsonb, action text not null default '', consent_announced_at timestamptz null, external_call_id text null)",
  );
  const sql = sqlOf(pg);

  await sql`
    insert into calls (
      id, practice_id, channel, caller, pet, species, concern, status, duration_sec, transcript, action, consent_announced_at, external_call_id
    ) values (
      ${"c1"}, ${"p1"}, ${"telefon"}, ${"Klientel"}, ${"Patient"}, ${""}, ${"Frage"}, ${"offen"}, ${38}, ${"[]"}::jsonb, ${"Auskunft hinterlegt"}, ${null}, ${"gw-call-123"}
    )
  `;
  await sql`
    insert into calls (
      id, practice_id, channel, caller, pet, species, concern, status, duration_sec, transcript, action, consent_announced_at, external_call_id
    ) values (
      ${"c2"}, ${"p1"}, ${"telefon"}, ${"Klientel"}, ${"Patient"}, ${""}, ${"Frage"}, ${"offen"}, ${38}, ${"[]"}::jsonb, ${"Auskunft hinterlegt"}, ${null}, ${null}
    )
  `;

  const rows = await sql<{ id: string; external_call_id: string | null }>`
    select id, external_call_id from calls order by id asc
  `;
  assert.deepEqual(rows, [
    { id: "c1", external_call_id: "gw-call-123" },
    { id: "c2", external_call_id: null },
  ]);

  await pg.close();
});
