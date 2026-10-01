import assert from "node:assert/strict";
import { test } from "node:test";
import { appointmentPreference } from "./appointment-preference.ts";

// Umlaute als \u-Escapes: sie ueberstehen jede Dateikonvertierung.
const AE = "\u00E4"; // a-Umlaut
const VORMITTAG = "Vormittag";
const NACHTMITTAG = "Nachmittag";
const NAECHSTE = `n${AE}chste`;

/**
 * Kernzusage: Eine konkret genannte Uhrzeit ist nur ein Wunsch. Silvia darf sie
 * niemals selbst buchen, sondern hinterlegt sie sichtbar als "Terminwunsch"
 * fuer die Tierarzthelferin.
 *
 * Die Sperre selbst sitzt in der Server-Funktion `askAlma` (Bedingung
 * `preference?.kind === "dateTime"` -> `type: "none"`, `kind: "Terminwunsch"`).
 * Sie wird durch `scripts/appointment-date-audit.mjs` Ende-zu-Ende im Browser
 * geprueft. Hier wird die Erkennung abgesichert, die diese Sperre ausloest:
 * Nur eine eindeutige Uhrzeit ergibt `dateTime`.
 */

const NOW = new Date(2026, 8, 12, 10, 0);

test("eine eindeutige Uhrzeit ergibt dateTime und loest damit die Terminwunsch-Sperre aus", () => {
  assert.deepEqual(appointmentPreference(["morgen um 15 Uhr"], NOW), {
    kind: "dateTime",
    date: "2026-09-13",
    time: "15:00",
  });
  assert.deepEqual(appointmentPreference(["morgen um 14:20"], NOW), {
    kind: "dateTime",
    date: "2026-09-13",
    time: "14:20",
  });
});

test("eine Uhrzeit ohne eindeutigen Tag bleibt unclear und bucht nichts", () => {
  // Ohne Tag darf kein dateTime entstehen, sonst greift die Sperre nicht.
  assert.deepEqual(appointmentPreference(["um 10 Uhr"], NOW), { kind: "unclear" });
});

test("eine ungenaue Tageszeit bleibt unclear statt eine Uhrzeit zu erfinden", () => {
  // Vormittag/Nachmittag sind keine eindeutige Uhrzeit und bleiben Rueckfragen.
  assert.deepEqual(appointmentPreference([`morgen am ${VORMITTAG}`], NOW), { kind: "unclear" });
  assert.deepEqual(appointmentPreference([`morgen am ${NACHTMITTAG}`], NOW), { kind: "unclear" });
  // Wortzeiten werden seit Punkt 4 gedeutet: "halb drei" ist 14:30.
  // Die ausfuehrlichen Faelle prueft appointment-preference.test.ts.
  assert.deepEqual(
    appointmentPreference(["morgen halb drei"], NOW),
    { kind: "dateTime", date: "2026-09-13", time: "14:30" },
  );
});

test("ein reiner Tageswunsch ergibt date, nicht dateTime", () => {
  // Ohne Uhrzeit bleibt der normale Tagespfad moeglich.
  assert.deepEqual(appointmentPreference(["morgen"], NOW), { kind: "date", date: "2026-09-13" });
  assert.deepEqual(appointmentPreference(["am Montag"], NOW), { kind: "date", date: "2026-09-14" });
});

test("ein freier Zeitraum bucht nichts und fragt nach", () => {
  assert.deepEqual(appointmentPreference([`irgendwann ${NAECHSTE} Woche`], NOW), { kind: "unclear" });
  assert.deepEqual(appointmentPreference(["heute oder morgen"], NOW), { kind: "unclear" });
});
