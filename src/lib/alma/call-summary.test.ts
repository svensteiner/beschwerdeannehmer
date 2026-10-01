import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alignSummaryAgreement,
  isUsableSummary,
  mapAgreementKind,
  parseSummary,
  summarizeCall,
  summaryMailSubject,
  summaryPrompt,
  viennaStamp,
} from "./call-summary.ts";

test("summaryPrompt enthaelt die Gespraechszeilen und die deutsche Struktur", () => {
  const prompt = summaryPrompt(["Anrufer: Mein Hund lahmt.", "Silvia: Wann geht es Ihnen gut?"]);
  assert.match(prompt, /Anliegen:/);
  assert.match(prompt, /Tier:/);
  assert.match(prompt, /Rueckruf noetig:/);
  assert.match(prompt, /Mein Hund lahmt\./);
});

test("parseSummary trimmt, kappt Zeilen und Laenge", () => {
  const many = Array.from({ length: 10 }, (_, i) => `Zeile ${i}`).join("\n");
  const out = parseSummary(`  ${many}  `);
  assert.equal(out.split("\n").length, 6);
  assert.ok(out.length <= 800);
});

test("parseSummary liefert leeren String fuer leeren Input", () => {
  assert.equal(parseSummary(""), "");
  assert.equal(parseSummary("   \n  "), "");
});

test("summarizeCall liefert das geparste Ergebnis der llm-Funktion", async () => {
  const out = await summarizeCall({
    llm: async () => "Anliegen: Impfung\nTier: Katze",
    lines: ["Anrufer: Ich brauche eine Impfung fuer meine Katze."],
  });
  assert.equal(out, "Anliegen: Impfung\nTier: Katze");
});

test("summarizeCall gibt bei leerem Transkript nie den llm auf", async () => {
  let called = false;
  const out = await summarizeCall({
    llm: async () => {
      called = true;
      return "x";
    },
    lines: [],
  });
  assert.equal(out, "");
  assert.equal(called, false);
});

test("summarizeCall faengt Fehler der llm-Funktion ab und wirft nie", async () => {
  const out = await summarizeCall({
    llm: async () => {
      throw new Error("boom");
    },
    lines: ["Anrufer: Hallo"],
  });
  assert.equal(out, "");
});

test("summarizeCall faengt Fehler durch abgelehnte Promise ab", async () => {
  const out = await summarizeCall({
    llm: () => Promise.reject(new Error("network")),
    lines: ["Anrufer: Hallo"],
  });
  assert.equal(out, "");
});

test("Punkt 5: ein Feldname ohne Inhalt ist keine Zusammenfassung", () => {
  // Reproduziert: „Tier:“ allein wurde als brauchbare Zusammenfassung
  // akzeptiert. Die Pruefung sah nur den Doppelpunkt, nicht den Wert.
  assert.equal(isUsableSummary("Tier:"), false);
  assert.equal(isUsableSummary("Anliegen:"), false);
  assert.equal(isUsableSummary("Vereinbart:"), false);
  assert.equal(isUsableSummary("Rueckruf noetig:"), false);
  assert.equal(isUsableSummary("Anliegen:   "), false);
  assert.equal(isUsableSummary("Tier:\nAnliegen:"), false, "mehrere leere Felder bleiben leer");

  // Mit Inhalt wird akzeptiert.
  assert.equal(isUsableSummary("Tier: Katze"), true);
  assert.equal(isUsableSummary("Tier:"), false);
  assert.equal(isUsableSummary("Anliegen: Impfung\nTier:"), true, "ein gefuelltes Feld genuegt");
  assert.equal(isUsableSummary("Vereinbart: offen"), true, "auch 'offen' ist ein Inhalt");
});

test("Punkt 5: eine Ablehnung des Modells ist keine Zusammenfassung", async () => {
  // Reproduziert: dieser Satz wurde als gueltige Zusammenfassung gespeichert.
  const out = await summarizeCall({
    llm: async () => "Ich kann das Gespraech nicht zusammenfassen.",
    lines: ["Anrufer: Hallo"],
  });
  assert.equal(out, "", "keine Ablehnung als Zusammenfassung speichern");
});

test("Punkt 5: weitere Ablehnungen und Entschuldigungen werden erkannt", () => {
  assert.equal(isUsableSummary("Ich kann das Gespraech nicht zusammenfassen."), false);
  assert.equal(isUsableSummary("Es tut mir leid, ich habe kein Transkript."), false);
  assert.equal(isUsableSummary("Als KI kann ich das nicht beurteilen."), false);
  assert.equal(isUsableSummary("Ich benoetige mehr Informationen."), false);
  assert.equal(isUsableSummary("Kein Transkript vorhanden."), false);
  assert.equal(isUsableSummary(""), false);
  // Eine echte Zusammenfassung wird akzeptiert.
  assert.equal(isUsableSummary("Anliegen: Impfung\nTier: Katze"), true);
  assert.equal(isUsableSummary("Vereinbart: Montag 09:00"), true);
  assert.equal(isUsableSummary("Rueckruf noetig: ja"), true);
  // Text ohne jedes Auskunfts-Stichwort ist keine Zusammenfassung.
  assert.equal(isUsableSummary("Der Anrufer war freundlich."), false);
});

test("Punkt 6: keine bestaetigte Buchung behaupten, die nur vorgemerkt ist", () => {
  const behauptet = "Anliegen: Impfung\nVereinbart: Termin am Montag fix";

  // Ohne bestaetigte Buchung wird die Zusage abgeschwaecht. Der Inhalt bleibt
  // erhalten, nur das Behauptungswort faellt weg.
  const wish = alignSummaryAgreement(behauptet, "wish");
  assert.match(wish, /Termin am Montag/);
  assert.match(wish, /nicht bestaetigt/);
  assert.ok(!/\bfix\b/.test(wish), "kein 'fix' mehr");
  assert.match(wish, /^Anliegen: Impfung/m, "die uebrigen Zeilen bleiben");

  // Ohne Aktion wird als nicht gebucht gekennzeichnet.
  assert.match(alignSummaryAgreement(behauptet, "none"), /nicht gebucht/);
  assert.match(alignSummaryAgreement(behauptet, null), /nicht gebucht/);

  // Eine wirklich gebuchte Aktion darf stehen bleiben.
  assert.equal(alignSummaryAgreement(behauptet, "booked"), behauptet);

  // Eine harmlose Zeile wird nicht angefasst.
  const harmlos = "Anliegen: Impfung\nVereinbart: offen";
  assert.equal(alignSummaryAgreement(harmlos, "wish"), harmlos);
  // Ohne Vereinbarungszeile ebenfalls nicht.
  assert.equal(alignSummaryAgreement("Anliegen: Impfung", "wish"), "Anliegen: Impfung");
});

test("Punkt 6: ein Terminwunsch wird auch ohne Schluesselwort gekennzeichnet", () => {
  // Reproduziert: dieser Satz blieb bei Status wish unveraendert, weil die
  // Korrektur nur auf bestimmte Woerter wartete.
  const summary = "Anliegen: Kontrolle\nVereinbart: Termin morgen um 15 Uhr";
  const korrigiert = alignSummaryAgreement(summary, "wish");
  assert.notEqual(korrigiert, summary, "die Zeile wird angefasst");
  assert.match(korrigiert, /Termin morgen um 15 Uhr/, "der Inhalt bleibt lesbar");
  assert.match(korrigiert, /vorgemerkt, noch nicht bestaetigt/);

  // Auch ohne Uhrzeit, aber mit Terminbezug.
  assert.match(alignSummaryAgreement("Vereinbart: Termin am Montag", "wish"), /nicht bestaetigt/);
  // Und mit Datum.
  assert.match(alignSummaryAgreement("Vereinbart: am 18.09.", "wish"), /nicht bestaetigt/);
});

test("Punkt 7: eine Rueckrufzusage wird nicht geloescht", () => {
  // Reproduziert: „Vereinbart: Rueckruf zugesagt“ wurde bei Status none zu
  // „offen“ — die Terminpruefung loeschte eine andere Vereinbarung.
  const rueckruf = "Anliegen: Befund\nVereinbart: Rueckruf zugesagt";
  assert.equal(alignSummaryAgreement(rueckruf, "none"), rueckruf, "unveraendert bei none");
  assert.equal(alignSummaryAgreement(rueckruf, "wish"), rueckruf, "unveraendert bei wish");
  assert.equal(
    alignSummaryAgreement("Vereinbart: wir rufen zurueck", "none"),
    "Vereinbart: wir rufen zurueck",
  );
  assert.equal(
    alignSummaryAgreement("Vereinbart: Halterin anrufen", "none"),
    "Vereinbart: Halterin anrufen",
  );

  // Status callback laesst grundsaetzlich alles stehen.
  assert.equal(alignSummaryAgreement(rueckruf, "callback"), rueckruf);
  assert.equal(
    alignSummaryAgreement("Vereinbart: Termin morgen fix", "callback"),
    "Vereinbart: Termin morgen fix",
  );
  // Uebergabe und Konflikt ebenso.
  assert.equal(
    alignSummaryAgreement("Vereinbart: Termin morgen", "transfer"),
    "Vereinbart: Termin morgen",
  );
  assert.equal(
    alignSummaryAgreement("Vereinbart: Termin morgen", "conflict"),
    "Vereinbart: Termin morgen",
  );
});

test("Punkt 8: gespeicherte Aktionen werden ausdruecklich zugeordnet", () => {
  // Genau die Werte, die board.ts schreibt.
  assert.equal(mapAgreementKind("Termin gelegt"), "booked");
  assert.equal(mapAgreementKind("Termin Impfung gelegt"), "booked");
  assert.equal(mapAgreementKind("Terminwunsch"), "wish");
  assert.equal(mapAgreementKind("Rückrufzettel"), "callback");
  assert.equal(mapAgreementKind("An die Tierarzthelferin"), "transfer");
  assert.equal(mapAgreementKind("An die Kassa"), "transfer");
  assert.equal(mapAgreementKind("Auskunft hinterlegt"), "none");
  assert.equal(mapAgreementKind("Tafelkonflikt: Vquadrat-Termin 7"), "conflict");
  // Alte Persist-Zeilen.
  assert.equal(mapAgreementKind("Termin Termin gelegt"), "booked");
  // Leer und Unbekanntes sind keine Zusage.
  assert.equal(mapAgreementKind(""), "none");
  assert.equal(mapAgreementKind(null), "none");
  assert.equal(mapAgreementKind("irgendwas"), "none");
  // Ein Rueckruf gewinnt nicht gegen ein „gelegt“, aber „zugesagt“ ist keins.
  assert.equal(mapAgreementKind("Rückruf zugesagt"), "callback");
});

test("Punkt 7: der Betreff traegt Wiener Zeit, nicht Serverzeit", () => {
  // Sommerzeit: 12:00 UTC ist 14:00 in Wien.
  const sommer = new Date("2026-07-15T12:00:00Z");
  assert.equal(viennaStamp(sommer, "Europe/Vienna"), "15.07.2026 14:00");
  // Winterzeit: 12:00 UTC ist 13:00 in Wien.
  const winter = new Date("2026-01-15T12:00:00Z");
  assert.equal(viennaStamp(winter, "Europe/Vienna"), "15.01.2026 13:00");
  // Der Unterschied zur Serverzeitzone ist messbar.
  assert.notEqual(viennaStamp(sommer, "Europe/Vienna"), viennaStamp(sommer, "UTC"));
  assert.equal(viennaStamp(sommer, "UTC"), "15.07.2026 12:00");

  // Der Betreff nennt die Zeit und die Kennung.
  assert.equal(
    summaryMailSubject(sommer, "call-7", "Europe/Vienna"),
    "Anrufzusammenfassung 15.07.2026 14:00 [call-7]",
  );
  // Ohne Kennung bleibt der Betreff lesbar.
  assert.equal(summaryMailSubject(sommer, "", "Europe/Vienna"), "Anrufzusammenfassung 15.07.2026 14:00");
});

test("Punkt 5/6 greifen auch im summarizeCall-Pfad", async () => {
  const out = await summarizeCall({
    llm: async () => "Anliegen: Impfung\nVereinbart: Termin gebucht",
    lines: ["Anrufer: Ich brauche einen Termin."],
    agreement: "wish",
  });
  assert.match(out, /Anliegen: Impfung/);
  assert.ok(!/gebucht/.test(out), "die ueberzogene Zusage ist korrigiert");
});
