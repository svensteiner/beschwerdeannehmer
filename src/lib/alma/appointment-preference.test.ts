import assert from "node:assert/strict";
import test from "node:test";
import { nextLocalRequestedSlot, appointmentPreference } from "./appointment-preference.ts";

const NOW = new Date(2026, 8, 12, 10, 0);
const HOURS = [
  { day: "Samstag", time: "09:00–12:00" },
  { day: "Sonntag", time: "geschlossen" },
];

test("erkennt heute, morgen und übermorgen", () => {
  assert.deepEqual(appointmentPreference(["heute"], NOW), { kind: "date", date: "2026-09-12" });
  assert.deepEqual(appointmentPreference(["morgen"], NOW), { kind: "date", date: "2026-09-13" });
  assert.deepEqual(appointmentPreference(["übermorgen"], NOW), { kind: "date", date: "2026-09-14" });
});

test("die letzte Korrektur gewinnt", () => {
  assert.deepEqual(
    appointmentPreference(["Bitte heute. Nein, morgen statt heute."], NOW),
    { kind: "date", date: "2026-09-13" },
  );
  assert.deepEqual(
    appointmentPreference(["morgen statt heute"], NOW),
    { kind: "date", date: "2026-09-13" },
  );
  assert.deepEqual(
    appointmentPreference(["nicht morgen, sondern heute"], NOW),
    { kind: "date", date: "2026-09-12" },
  );
});

test("erkennt Wochentage und fragt bei unklarem Zeitraum nach", () => {
  assert.deepEqual(appointmentPreference(["am Montag"], NOW), { kind: "date", date: "2026-09-14" });
  assert.deepEqual(appointmentPreference(["irgendwann nächste Woche"], NOW), { kind: "unclear" });
  assert.deepEqual(appointmentPreference(["heute oder morgen"], NOW), { kind: "unclear" });
  assert.equal(appointmentPreference(["Guten Morgen"], NOW), null);
  assert.deepEqual(appointmentPreference(["Guten Morgen, morgen bitte einen Termin"], NOW), { kind: "date", date: "2026-09-13" });
  assert.deepEqual(appointmentPreference(["heute", "Guten Morgen"], NOW), { kind: "date", date: "2026-09-12" });
  assert.deepEqual(appointmentPreference(["Montag statt Dienstag"], NOW), { kind: "date", date: "2026-09-14" });
  assert.deepEqual(appointmentPreference(["Montag oder Dienstag"], NOW), { kind: "unclear" });
  assert.deepEqual(appointmentPreference(["morgen um 15 Uhr"], NOW), { kind: "dateTime", date: "2026-09-13", time: "15:00" });
  assert.deepEqual(appointmentPreference(["morgen um 14:20"], NOW), { kind: "dateTime", date: "2026-09-13", time: "14:20" });
  assert.deepEqual(appointmentPreference(["morgen", "Ja, aber um 15 Uhr"], NOW), { kind: "dateTime", date: "2026-09-13", time: "15:00" });
  assert.deepEqual(appointmentPreference(["um 10 Uhr"], NOW), { kind: "unclear" });
  assert.equal(appointmentPreference(["Mein Hund ist 3 Jahre alt"], NOW), null);
  assert.deepEqual(appointmentPreference(["morgen 15 Uhr", "Ja"], NOW), { kind: "dateTime", date: "2026-09-13", time: "15:00" });
});

test("die letzte genannte Uhrzeit gewinnt (Uhrzeitkorrektur)", () => {
  // „um 15 Uhr“ ... „Nein, um 16 Uhr“: die Korrektur muss greifen, sonst bleibt
  // der Wunsch auf der alten Zeit stehen.
  assert.deepEqual(
    appointmentPreference(["morgen um 15 Uhr", "Nein, um 16 Uhr"], NOW),
    { kind: "dateTime", date: "2026-09-13", time: "16:00" },
  );
  assert.deepEqual(
    appointmentPreference(["übermorgen um 9 Uhr", "Lieber um 11:30 Uhr"], NOW),
    { kind: "dateTime", date: "2026-09-14", time: "11:30" },
  );
});

test("eine Tageskorrektur behält die genannte Uhrzeit", () => {
  // „morgen statt heute“ ist die Korrektur (morgen gewinnt) und die Uhrzeit
  // muss erhalten bleiben — sonst fehlt die Grundlage für den Terminwunsch.
  assert.deepEqual(
    appointmentPreference(["morgen statt heute um 15 Uhr"], NOW),
    { kind: "dateTime", date: "2026-09-13", time: "15:00" },
  );
  assert.deepEqual(
    appointmentPreference(["nicht morgen, sondern heute um 08:30 Uhr"], NOW),
    { kind: "dateTime", date: "2026-09-12", time: "08:30" },
  );
});

test("eine unmögliche Uhrzeit ergibt eine Rückfrage statt eines reinen Tageswunsches", () => {
  // Früher wurde „um 25 Uhr“ still zu einem Tageswunsch: der Termin wäre ohne
  // die gewünschte Zeit gelegt worden.
  assert.deepEqual(appointmentPreference(["morgen um 25 Uhr"], NOW), { kind: "unclear" });
  assert.deepEqual(appointmentPreference(["morgen um 13:75"], NOW), { kind: "unclear" });
  assert.deepEqual(appointmentPreference(["morgen 44 Uhr"], NOW), { kind: "unclear" });
  // Gültige Grenzen bleiben gültig.
  assert.deepEqual(appointmentPreference(["morgen um 23:59"], NOW), { kind: "dateTime", date: "2026-09-13", time: "23:59" });
  assert.deepEqual(appointmentPreference(["morgen um 0 Uhr"], NOW), { kind: "dateTime", date: "2026-09-13", time: "00:00" });
});

test("konkrete Kalenderdaten werden verstanden", () => {
  assert.deepEqual(appointmentPreference(["Am 18.09.2026 um 15 Uhr"], NOW), { kind: "dateTime", date: "2026-09-18", time: "15:00" });
  assert.deepEqual(appointmentPreference(["Am 18.09.2026"], NOW), { kind: "date", date: "2026-09-18" });
  assert.deepEqual(appointmentPreference(["am 18.9.2026"], NOW), { kind: "date", date: "2026-09-18" });
  assert.deepEqual(appointmentPreference(["am 18/09/2026"], NOW), { kind: "date", date: "2026-09-18" });
  // Tag vor Monat, wie in Österreich üblich; ohne Jahr das nächste Vorkommen.
  assert.deepEqual(appointmentPreference(["am 18.09."], NOW), { kind: "date", date: "2026-09-18" });
});

test("unmögliche und vergangene Kalenderdaten ergeben eine Rückfrage", () => {
  assert.deepEqual(appointmentPreference(["am 32.09.2026"], NOW), { kind: "unclear" });
  assert.deepEqual(appointmentPreference(["am 18.13.2026"], NOW), { kind: "unclear" });
  assert.deepEqual(appointmentPreference(["am 31.02.2026"], NOW), { kind: "unclear" });
  assert.deepEqual(appointmentPreference(["am 01.01.2020"], NOW), { kind: "unclear" });
  // Schaltjahr wird beachtet.
  assert.deepEqual(appointmentPreference(["am 29.02.2028"], NOW), { kind: "date", date: "2028-02-29" });
  assert.deepEqual(appointmentPreference(["am 29.02.2026"], NOW), { kind: "unclear" });
});

test("jede spätere Korrektur gewinnt — Tag, Uhrzeit und Wortzeit", () => {
  // Ein Kalenderdatum wird nachträglich auf einen anderen Tag korrigiert; die
  // bereits genannte Uhrzeit bleibt erhalten.
  assert.deepEqual(
    appointmentPreference(["18.09. um 15 Uhr", "Nein, morgen"], NOW),
    { kind: "dateTime", date: "2026-09-13", time: "15:00" },
  );
  // Eine unmögliche Uhrzeit wird durch eine gültige ersetzt.
  assert.deepEqual(
    appointmentPreference(["morgen um 25 Uhr", "Entschuldigung, 15 Uhr"], NOW),
    { kind: "dateTime", date: "2026-09-13", time: "15:00" },
  );
  // Auch ausgeschriebene Uhrzeiten lassen sich korrigieren.
  assert.deepEqual(
    appointmentPreference(["morgen halb vier", "Nein, halb fünf"], NOW),
    { kind: "dateTime", date: "2026-09-13", time: "16:30" },
  );
  // Eine Uhrzeit ohne „um“ wird ebenso als Korrektur erkannt.
  assert.deepEqual(
    appointmentPreference(["morgen 15 Uhr", "Nein, 16:30 Uhr"], NOW),
    { kind: "dateTime", date: "2026-09-13", time: "16:30" },
  );
});

test("mehrere angebotene Uhrzeiten ergeben eine Rückfrage", () => {
  // „15 oder 16 Uhr“ ist keine Entscheidung — Silvia darf nicht raten.
  assert.deepEqual(appointmentPreference(["morgen 15 oder 16 Uhr"], NOW), { kind: "unclear" });
  assert.deepEqual(appointmentPreference(["morgen 15 bis 16 Uhr"], NOW), { kind: "unclear" });
});

test("die Tageshälfte macht eine Wortzeit eindeutig", () => {
  // „abends“ hebt auf den Abend: halb acht abends ist 19:30, nicht 07:30.
  assert.deepEqual(
    appointmentPreference(["morgen halb acht abends"], NOW),
    { kind: "dateTime", date: "2026-09-13", time: "19:30" },
  );
  // Ohne Tageshälfte gilt die Ordinationszeit.
  assert.deepEqual(
    appointmentPreference(["morgen halb acht"], NOW),
    { kind: "dateTime", date: "2026-09-13", time: "07:30" },
  );
});

test("eine unvollständige Uhrzeit wird nicht falsch gedeutet", () => {
  // „15:3“ darf weder 15:30 noch 03:00 ergeben, sondern eine Rückfrage.
  assert.deepEqual(appointmentPreference(["morgen 15:3 Uhr"], NOW), { kind: "unclear" });
  assert.deepEqual(appointmentPreference(["morgen um 15:3"], NOW), { kind: "unclear" });
});

test("jede spätere Tageskorrektur gewinnt, auch gegen ein Kalenderdatum", () => {
  // Ein Kalenderdatum wird auf einen Wochentag korrigiert.
  assert.deepEqual(
    appointmentPreference(["Am 18.09.", "Nein, Montag"], NOW),
    { kind: "date", date: "2026-09-14" },
  );
  // Und auf einen relativen Tag.
  assert.deepEqual(
    appointmentPreference(["Am 18.09. um 15 Uhr", "Nein, morgen"], NOW),
    { kind: "dateTime", date: "2026-09-13", time: "15:00" },
  );
});

test("ein zurückgenommener Wunsch ergibt eine Rückfrage", () => {
  // „egal wann“ hebt die vorher genannte Zeit auf.
  assert.deepEqual(appointmentPreference(["Morgen um 15 Uhr", "Doch egal wann"], NOW), { kind: "unclear" });
  assert.deepEqual(appointmentPreference(["am 18.09.", "irgendwann anders"], NOW), { kind: "unclear" });
});

test("zwei Kalenderdaten sind eine Auswahl, kein Wunsch", () => {
  assert.deepEqual(appointmentPreference(["18.09. oder 19.09."], NOW), { kind: "unclear" });
  assert.deepEqual(appointmentPreference(["am 18.09.2026 oder 19.09.2026"], NOW), { kind: "unclear" });
  // Ein einzelnes Datum bleibt gültig.
  assert.deepEqual(appointmentPreference(["am 18.09.2026"], NOW), { kind: "date", date: "2026-09-18" });
});

test("ein ungültiges Datum als Korrektur ergibt eine Rückfrage", () => {
  // Der 31. Februar existiert nicht — die Korrektur darf nicht still auf
  // „morgen“ zurückfallen.
  assert.deepEqual(appointmentPreference(["Morgen", "Nein, am 31.02.2027"], NOW), { kind: "unclear" });
  assert.deepEqual(appointmentPreference(["am 18.09.", "Nein, am 32.09.2026"], NOW), { kind: "unclear" });
});

test("eine zweiteilige Zahl mit unplausiblem Monat ist kein Datum", () => {
  // „8.30“ ist eine Uhrzeit, kein Datum (Tag 8, Monat 30).
  assert.deepEqual(
    appointmentPreference(["morgen 8.30 Uhr"], NOW),
    { kind: "dateTime", date: "2026-09-13", time: "08:30" },
  );
});

test("österreichische Wortzeiten werden gedeutet", () => {
  // AT-Lesart: die Stunde, auf die es zugeht. „halb vier“ ist 15:30.
  assert.deepEqual(appointmentPreference(["morgen halb vier"], NOW), { kind: "dateTime", date: "2026-09-13", time: "15:30" });
  assert.deepEqual(appointmentPreference(["morgen viertel vier"], NOW), { kind: "dateTime", date: "2026-09-13", time: "15:15" });
  assert.deepEqual(appointmentPreference(["morgen dreiviertel vier"], NOW), { kind: "dateTime", date: "2026-09-13", time: "15:45" });
  // Vormittag bleibt Vormittag: „halb acht“ ist 07:30, nicht 19:30.
  assert.deepEqual(appointmentPreference(["morgen halb acht"], NOW), { kind: "dateTime", date: "2026-09-13", time: "07:30" });
  assert.deepEqual(appointmentPreference(["morgen viertel acht"], NOW), { kind: "dateTime", date: "2026-09-13", time: "07:15" });
  assert.deepEqual(appointmentPreference(["morgen dreiviertel acht"], NOW), { kind: "dateTime", date: "2026-09-13", time: "07:45" });
  // Hochdeutsche Formen bleiben gültig.
  assert.deepEqual(appointmentPreference(["morgen viertel nach zwei"], NOW), { kind: "dateTime", date: "2026-09-13", time: "14:15" });
  assert.deepEqual(appointmentPreference(["morgen viertel vor drei"], NOW), { kind: "dateTime", date: "2026-09-13", time: "14:45" });
  // Eine Uhrzeit vor 07:00 ist in der Ordination unbrauchbar und wird auf den
  // Nachmittag gehoben.
  assert.deepEqual(appointmentPreference(["morgen halb drei"], NOW), { kind: "dateTime", date: "2026-09-13", time: "14:30" });
  // Wortzeit und ausdrücklicher Nachmittag passen zusammen.
  assert.deepEqual(appointmentPreference(["morgen halb fünf"], NOW), { kind: "dateTime", date: "2026-09-13", time: "16:30" });
  // Wortzeit behält den genannten Tag, auch „übermorgen“.
  assert.deepEqual(appointmentPreference(["übermorgen halb vier"], NOW), { kind: "dateTime", date: "2026-09-14", time: "15:30" });
});

test("wählt heute ab jetzt und fällt bei geschlossenem Wunschtag nicht aus", () => {
  const today = nextLocalRequestedSlot(HOURS, [], "2026-09-12", NOW);
  assert.equal(today?.toISOString().slice(0, 10), "2026-09-12");
  assert.equal(nextLocalRequestedSlot(HOURS, [], "2026-09-13", NOW), null);
  assert.equal(nextLocalRequestedSlot(HOURS, [], "2026-09-11", NOW), null);
});

test("kein erfundener Slot bei leeren, geschlossenen oder voll belegten Fenstern", () => {
  assert.equal(nextLocalRequestedSlot([], [], "2026-09-12", NOW), null);
  assert.equal(
    nextLocalRequestedSlot([{ day: "Samstag", time: "geschlossen" }], [], "2026-09-12", NOW),
    null,
  );
  const occupied = Array.from({ length: 6 }, (_, index) => ({
    start: new Date(2026, 8, 12, 9 + Math.floor(index / 2), index % 2 ? 30 : 0),
    minutes: 30,
  }));
  assert.equal(nextLocalRequestedSlot(HOURS, occupied, "2026-09-12", NOW), null);
});
