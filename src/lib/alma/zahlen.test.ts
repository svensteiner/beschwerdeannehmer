import assert from "node:assert/strict";
import { test } from "node:test";
import { correctNumbers, normalizeNumberSequences, normalizeTimes } from "./zahlen.ts";

// Testsätze aus C:\silvia-voice\tests\stt\saetze.txt (AP 38), Erwartungswerte
// gegen lib/entity_fix.py (normalize_times + normalize_number_sequences,
// ohne Namensabgleich) verifiziert.

test("Uhrzeiten aus saetze.txt: 'X Uhr Y' -> HH:MM", () => {
  assert.equal(
    correctNumbers("Können wir einen Termin um vierzehn Uhr dreißig ausmachen."),
    "Können wir einen Termin um 14:30 ausmachen.",
  );
  assert.equal(
    correctNumbers("Termin bitte um neun Uhr fünfzehn am Dienstag."),
    "Termin bitte um 09:15 am Dienstag.",
  );
});

test("zusammengesetzte Minutenwörter bleiben unangetastet (bekannte Lücke, wie im Python-Original)", () => {
  assert.equal(
    correctNumbers("Ich hätte gern einen Termin um siebzehn Uhr fünfundvierzig."),
    "Ich hätte gern einen Termin um siebzehn Uhr fünfundvierzig.",
  );
});

test("'Uhr' gefolgt von einem Nicht-Zahlwort bleibt unangetastet", () => {
  assert.equal(
    correctNumbers("Wir kommen um acht Uhr in der Früh vorbei, wenn das passt."),
    "Wir kommen um acht Uhr in der Früh vorbei, wenn das passt.",
  );
});

test("Telefonnummer aus deutschen Zahlwörtern wird zu einer Ziffernfolge zusammengezogen", () => {
  assert.equal(
    correctNumbers("Bitte rufen Sie mich unter null sechs vier drei, eins zwei drei vier fünf sechs zurück."),
    "Bitte rufen Sie mich unter 0643123456 zurück.",
  );
  assert.equal(
    correctNumbers(
      "Können Sie mir die Telefonnummer null eins, fünf sieben zwo, acht neun null null geben.",
    ),
    "Können Sie mir die Telefonnummer 015728900 geben.",
  );
  assert.equal(
    correctNumbers("Erreichen Sie uns unter null sieben null fünf, sechs sechs sieben acht neun."),
    "Erreichen Sie uns unter 070566789",
  );
});

test("Chipnummer-artige Ziffernfolge, trailing Satzzeichen im letzten Zahlwort geht verloren (wie im Original)", () => {
  assert.equal(
    correctNumbers("Bitte notieren Sie die Nummer null sechs sechs vier, drei drei zwo, eins eins null."),
    "Bitte notieren Sie die Nummer 0664332110",
  );
});

test("Sätze ohne Zahlen bleiben unverändert", () => {
  assert.equal(
    correctNumbers("Mein Hund Bello braucht einen Termin zur Kastration."),
    "Mein Hund Bello braucht einen Termin zur Kastration.",
  );
  assert.equal(
    correctNumbers("Die Katze Minka bekommt heute ihre Tollwutimpfung."),
    "Die Katze Minka bekommt heute ihre Tollwutimpfung.",
  );
});

test("viertel/dreiviertel vor/nach X -> HH:MM", () => {
  assert.equal(correctNumbers("Ich komme viertel nach zehn vorbei."), "Ich komme 10:15 vorbei.");
  assert.equal(correctNumbers("Wir treffen uns viertel vor elf."), "Wir treffen uns 10:45.");
  assert.equal(correctNumbers("Der Bus kommt um dreiviertel vor zwölf."), "Der Bus kommt um 11:45.");
});

test("normalizeTimes und normalizeNumberSequences sind einzeln aufrufbar (wie normalize_times/normalize_number_sequences)", () => {
  assert.equal(normalizeTimes("neun Uhr fünfzehn"), "09:15");
  assert.equal(normalizeNumberSequences("null sechs sechs vier"), "0664");
  // Ein oder zwei Zahlwörter allein werden nicht zusammengezogen (normale Sprache).
  assert.equal(normalizeNumberSequences("wir waren zwei Personen"), "wir waren zwei Personen");
});

test("ein bis zwei Zahlwörter werden nicht als Nummer zusammengezogen", () => {
  assert.equal(correctNumbers("Wir sind zwei Katzen und ein Hund."), "Wir sind zwei Katzen und ein Hund.");
});
