import assert from "node:assert/strict";
import { test } from "node:test";
import { PRACTICE } from "./data.ts";
import {
  deskStatus,
  deskStatusAt,
  easterSunday,
  dayIso,
  extraClosedDays,
  extraClosedOn,
  extraClosedOpenId,
  kalenderCanExtraClose,
  nextExtraClosedSeed,
  kalenderClosedEmptyCopy,
  KALENDER_EMPTY_COPY,
  KALENDER_EMPTY_COPY_ANZEIGE,
  KALENDER_HOLIDAY_EMPTY_COPY,
  KALENDER_HOLIDAY_EMPTY_COPY_ANZEIGE,
  kalenderClosedOpenId,
  kalenderClosedSaveId,
  extraClosedUpcoming,
  extraClosedRoom,
  EXTRA_CLOSED_PAST_ERROR,
  formatHourDayAt,
  formatHourTimeAt,
  MAX_HOUR_ROWS,
  prunePastExtraClosed,
  hoursLabelForDay,
  hoursMatchTemplate,
  hoursPauseCopy,
  hoursReply,
  hoursRowForDay,
  hoursSystemRule,
  isHoursTurn,
  isHoliday,
  isMovableHoliday,
  isOpenHourAt,
  isOpenRangeAt,
  parseTimeWindows,
  clockMinutes,
  kalenderChipClosedLabel,
  nextFreeSlotAt,
  nextOpenSlotAt,
  occupiedFromAppointments,
  occupyingSlot,
  parseHourDayIso,
  parseHourWindows,
  parseHoursJson,
  SIGNUP_CLOSED_TIME,
  SIGNUP_HOURS,
  signupHoursIfStillHuber,
  slotsOverlap,
  upsertExtraClosedDay,
  removeExtraClosedDay,
  walkInBlocked,
  walkInClosed,
  walkInFromDay,
  walkInSeedSlot,
  dayIsWalkInClosed,
  retargetClosedDayStart,
} from "./hours.ts";

const DEFAULT = parseHourWindows(PRACTICE.hours);

test("parses Huber windows including en-dash ranges", () => {
  const monday = DEFAULT.filter((w) => w.day === 1);
  assert.equal(monday.length, 2);
  assert.equal(monday[0]?.startMin, 8 * 60);
  assert.equal(monday[0]?.endMin, 12 * 60);
  assert.equal(monday[1]?.startMin, 14 * 60);
  assert.equal(monday[1]?.endMin, 18 * 60);
  assert.equal(DEFAULT.some((w) => w.day === 0), false);
});

test("custom hours open only in the hinterlegte Fenster", () => {
  const windows = parseHourWindows([
    { day: "Dienstag", time: "9:00-11:00" },
    { day: "Sonntag", time: "geschlossen · Nachtdienst" },
  ]);
  const tueOpen = new Date(2026, 7, 25, 10, 0); // Tuesday
  const tueClosed = new Date(2026, 7, 25, 15, 0);
  const mon = new Date(2026, 7, 24, 10, 0); // Monday
  assert.equal(isOpenHourAt(tueOpen, windows), true);
  assert.equal(isOpenHourAt(tueClosed, windows), false);
  assert.equal(isOpenHourAt(mon, windows), false);
});

test("default Huber: Mittagssperre and Saturday morning", () => {
  const mondayMorning = new Date(2026, 7, 24, 10, 0);
  const mondayNoon = new Date(2026, 7, 24, 13, 0);
  const saturday = new Date(2026, 7, 29, 10, 0);
  const sunday = new Date(2026, 7, 30, 10, 0);
  assert.equal(isOpenHourAt(mondayMorning, DEFAULT), true);
  assert.equal(isOpenHourAt(mondayNoon, DEFAULT), false);
  assert.equal(isOpenHourAt(saturday, DEFAULT), true);
  assert.equal(isOpenHourAt(sunday, DEFAULT), false);
  assert.equal(deskStatusAt(DEFAULT, mondayNoon).code, "mittag");
});

test("next slot jumps to the next hinterlegte window", () => {
  const windows = parseHourWindows([{ day: "Donnerstag", time: "14:00–16:00" }]);
  const wednesday = new Date(2026, 7, 26, 10, 0);
  const slot = nextOpenSlotAt(windows, wednesday);
  assert.equal(slot?.getDay(), 4);
  assert.equal(slot?.getHours(), 14);
});

test("walk-in outside hours names the next open slot", () => {
  const noon = new Date(2026, 7, 25, 13, 0); // Tuesday Mittagssperre
  const closed = walkInClosed(noon, DEFAULT);
  assert.ok(closed);
  assert.match(closed.error, /Nächster Slot:/);
  assert.match(closed.error, /14:00/);
  assert.equal(closed.next.getHours(), 14);
  assert.equal(walkInClosed(new Date(2026, 7, 25, 15, 0), DEFAULT), null);
});

test("a laid slot is occupied; the next free tick is offered", () => {
  const taken = new Date(2026, 7, 25, 15, 0);
  const occupied = [{ start: taken, minutes: 20, pet: "Nala" }];
  assert.ok(occupyingSlot(taken, 20, occupied));
  assert.equal(slotsOverlap(taken, 20, new Date(2026, 7, 25, 15, 20), 20), false);
  assert.equal(slotsOverlap(taken, 20, new Date(2026, 7, 25, 15, 10), 20), true);
  const next = nextFreeSlotAt(DEFAULT, occupied, new Date(2026, 7, 25, 14, 50));
  // Punkt 17: Vorher wurde in 30-Minuten-Schritten gesucht und die Luecke ab
  // 15:20 uebersprungen — der Vorschlag lautete 15:30. Das feinere Raster
  // findet den ersten wirklich freien Anfang.
  assert.equal(next?.getHours(), 15);
  assert.equal(next?.getMinutes(), 20);
  const blocked = walkInBlocked(taken, DEFAULT, occupied);
  assert.ok(blocked);
  assert.match(blocked.error, /belegt \(Nala\)/);
  assert.match(blocked.error, /15:20/);
  assert.equal(walkInBlocked(taken, DEFAULT, []), null);
});

test("Punkt 15: der ganze Termin muss in die Oeffnungszeiten passen", () => {
  const windows = parseHourWindows([{ day: "Mittwoch", time: "8:00–12:00" }]);
  const mittwoch = (h: number, m: number) => new Date(2026, 7, 26, h, m);

  // 20 Minuten passen bequem.
  assert.equal(isOpenRangeAt(mittwoch(8, 0), 20, windows), true);
  // 11:50 + 20 Minuten endet 12:10 — das Fenster endet um 12:00.
  // Frueher pruefte nur der Beginn: das galt als frei.
  assert.equal(isOpenHourAt(mittwoch(11, 50), windows), true, "der Beginn liegt im Fenster");
  assert.equal(isOpenRangeAt(mittwoch(11, 50), 20, windows), false, "der Termin passt nicht hinein");
  // 11:40 + 20 endet genau um 12:00 — das ist erlaubt.
  assert.equal(isOpenRangeAt(mittwoch(11, 40), 20, windows), true);

  // Und die Suche liefert am selben Tag keinen Slot mehr, der ueber das Ende
  // laeuft — sie geht auf den naechsten Tag mit Fenster.
  const slot = nextFreeSlotAt(windows, [], mittwoch(11, 45));
  assert.notEqual(dayIso(slot!), "2026-08-26", "am selben Tag passt nichts mehr");
  assert.equal(isOpenRangeAt(slot!, 20, windows), true, "der gefundene Termin passt vollstaendig");

  // Ohne Fenster gibt es nichts.
  assert.equal(isOpenRangeAt(mittwoch(9, 0), 20, []), false);
});

test("Punkt 16: ohne freien Termin kommt null statt eines Datums", () => {
  // Keine hinterlegten Fenster: frueher kam direkt der Ausgangszeitpunkt zurueck
  // und sah wie ein konkreter Vorschlag aus.
  const from = new Date(2026, 7, 26, 9, 0);
  assert.equal(nextFreeSlotAt([], [], from), null);
  assert.equal(nextOpenSlotAt([], from), null);

  // walkInBlocked nennt den fehlenden Termin ausdruecklich und behaelt den
  // Ausgangspunkt als Formularwert.
  const blockedNoHours = walkInBlocked(new Date(2026, 7, 26, 13, 0), [], []);
  assert.ok(blockedNoHours);
  assert.match(blockedNoHours.error, /Keine hinterlegten Öffnungszeiten/);
  assert.equal(blockedNoHours.next.getTime(), new Date(2026, 7, 26, 13, 0).getTime());
});

test("Punkt 16: ausgeschoepfte Suche nennt keinen erfundenen Termin", () => {
  // Ein einziges Fenster, und alles darin ist belegt: dann gibt es im ganzen
  // Suchfenster keinen freien Termin.
  const windows = parseHourWindows([{ day: "Mittwoch", time: "8:00–12:00" }]);
  const occupied: Array<{ start: Date; minutes: number }> = [];
  // Drei Mittwoche im Suchfenster, je 12 Intervalle a 20 Minuten.
  for (const dayOffset of [0, 7, 14]) {
    for (let slot = 0; slot < 12; slot += 1) {
      const start = new Date(2026, 7, 26 + dayOffset, 8, slot * 20);
      occupied.push({ start, minutes: 20 });
    }
  }
  assert.equal(nextFreeSlotAt(windows, occupied, new Date(2026, 7, 26, 8, 0)), null);

  // Und der Text benennt das, statt eine Uhrzeit zu nennen.
  const blocked = walkInBlocked(new Date(2026, 7, 26, 13, 0), windows, occupied);
  assert.ok(blocked);
  assert.match(blocked.error, /kein freier Slot hinterlegt/);
  assert.ok(!/Nächster Slot/.test(blocked.error), "keine erfundene Uhrzeit");
});

test("Punkt 17: eine Luecke zwischen Terminen wird gefunden", () => {
  const windows = parseHourWindows([{ day: "Dienstag", time: "8:00–12:00" }]);
  const dienstag = (h: number, m: number) => new Date(2026, 7, 25, h, m);

  // 8:00–8:20 belegt, danach ist bis 12:00 frei.
  const occupied = [{ start: dienstag(8, 0), minutes: 20, pet: "Nala" }];
  const slot = nextFreeSlotAt(windows, occupied, dienstag(8, 0));
  // Mit 30-Minuten-Schritten waere 8:30 herausgekommen; 8:20 ist der ehrliche
  // erste freie Anfang.
  assert.equal(slot?.getHours(), 8);
  assert.equal(slot?.getMinutes(), 20);

  // Eine Luecke mitten im Tag: 8:00–9:00 und 9:30–12:00 belegt.
  const two = [
    { start: dienstag(8, 0), minutes: 60, pet: "A" },
    { start: dienstag(9, 30), minutes: 150, pet: "B" },
  ];
  const gap = nextFreeSlotAt(windows, two, dienstag(8, 0));
  assert.equal(gap?.getHours(), 9);
  assert.equal(gap?.getMinutes(), 0, "die halbe Stunde zwischen den Terminen wird genutzt");
});

test("Punkt 18: ungueltige Zeiten ergeben kein Zeitfenster", () => {
  // Der Parser rechnete roh: „25:00“ wurde zu 1500 Minuten, „8:70“ zu 550 —
  // beides entstand als Zeitfenster, obwohl es keine Uhrzeit ist.
  assert.deepEqual(clockMinutes("25", "00"), null, "Stunde ueber 23");
  assert.deepEqual(clockMinutes("24", "00"), null);
  assert.deepEqual(clockMinutes("8", "70"), null, "Minute ueber 59");
  assert.deepEqual(clockMinutes("8", "60"), null);
  assert.deepEqual(clockMinutes("-1", "00"), null);
  assert.deepEqual(clockMinutes("acht", "00"), null);
  // Gueltige Angaben bleiben.
  assert.equal(clockMinutes("8", "00"), 480);
  assert.equal(clockMinutes("0", "00"), 0);
  assert.equal(clockMinutes("23", "59"), 1439);

  // Und im Fensterparser ebenso.
  assert.deepEqual(parseTimeWindows("25:00–26:00"), [], "keine Stunde 25");
  assert.deepEqual(parseTimeWindows("8:70–12:00"), [], "keine Minute 70");
  assert.deepEqual(parseTimeWindows("8:00–8:00"), [], "kein Fenster ohne Dauer");
  assert.deepEqual(parseTimeWindows("12:00–8:00"), [], "Ende vor Beginn");
  assert.deepEqual(parseTimeWindows("8:00–12:00"), [{ startMin: 480, endMin: 720 }]);
  // Mehrere Fenster, das ungueltige faellt weg.
  assert.deepEqual(parseTimeWindows("8:00–12:00, 25:00–26:00"), [{ startMin: 480, endMin: 720 }]);

  // Und parseHourWindows uebernimmt nur die gueltigen.
  const windows = parseHourWindows([{ day: "Montag", time: "8:00–12:00, 25:00–26:00" }]);
  assert.equal(windows.length, 1);
  assert.equal(windows[0]?.startMin, 480);
  assert.equal(windows[0]?.endMin, 720);
});

test("empty hours_json falls back; stored rows parse", () => {  const fallback = [{ day: "Montag", time: "8:00–12:00" }];
  assert.deepEqual(parseHoursJson("[]", fallback), fallback);
  assert.deepEqual(parseHoursJson(null, fallback), fallback);
  const hours = parseHoursJson(JSON.stringify([{ day: "Dienstag", time: "9:00–13:00" }, { day: "", time: "x" }]), fallback);
  assert.equal(hours.length, 1);
  assert.equal(hours[0]?.day, "Dienstag");
});

test("desk labels today's hinterlegte Fenster without guessing 15:00", () => {
  const wed = new Date(2026, 7, 26, 15, 0);
  const thu = new Date(2026, 7, 27, 15, 0);
  const sun = new Date(2026, 7, 30, 10, 0);
  assert.equal(hoursLabelForDay(PRACTICE.hours, wed), "8:00–12:00");
  assert.equal(hoursLabelForDay(PRACTICE.hours, thu), "8:00–12:00, 14:00–18:00");
  assert.equal(hoursLabelForDay(PRACTICE.hours, sun), "geschlossen");
  assert.equal(hoursRowForDay(PRACTICE.hours, wed)?.day, "Mittwoch");
  assert.equal(hoursLabelForDay([], wed), "keine Zeiten hinterlegt");
  const taken = occupiedFromAppointments([
    { start_at: "2026-08-27T15:00:00", minutes: 20, status: "gelegt", pet: "Momo" },
    { start_at: "2026-08-27T16:00:00", minutes: 20, status: "abgesagt", pet: "Nala" },
  ]);
  assert.equal(taken.length, 1);
  assert.equal(taken[0]?.pet, "Momo");
  const leftoverTaken = occupiedFromAppointments([
    {
      start_at: "2026-08-31T08:00:00",
      minutes: 20,
      status: "gelegt",
      pet: "Patient",
      owner_name: "Klientel",
    },
    {
      start_at: "2026-08-31T17:30:00",
      minutes: 20,
      status: "gelegt",
      pet: "Patient",
      owner_name: "Frau Holzer",
    },
  ]);
  assert.equal(leftoverTaken.length, 1);
  assert.equal(leftoverTaken[0]?.pet, "Patient");
  assert.equal(leftoverTaken[0]?.start.getHours(), 17);
  const next = nextFreeSlotAt(DEFAULT, taken, wed);
  assert.equal(next?.getDay(), 4);
  assert.match(String(next?.getHours()), /^(8|14)$/);
  const wedAfternoon = walkInSeedSlot(PRACTICE.hours, [], wed);
  assert.equal(wedAfternoon.start.getDay(), 4);
  assert.equal(wedAfternoon.time, "08:00");
  const wedMorning = walkInSeedSlot(PRACTICE.hours, [], new Date(2026, 7, 26, 7, 0));
  assert.equal(wedMorning.start.getDate(), 26);
  assert.equal(wedMorning.time, "08:00");
  assert.equal(walkInSeedSlot([], [], wed).time, "15:00");
});

test("AT Feiertage include Ostermontag and Fronleichnam; Karfreitag does not", () => {
  const easter = easterSunday(2026);
  assert.equal(easter.getFullYear(), 2026);
  assert.equal(easter.getMonth(), 3);
  assert.equal(easter.getDate(), 5);
  assert.equal(easterSunday(2025).getDate(), 20);
  assert.equal(easterSunday(2025).getMonth(), 3);
  assert.equal(easterSunday(2024).getMonth(), 2);
  assert.equal(easterSunday(2024).getDate(), 31);

  const ostermontag = new Date(2026, 3, 6, 10, 0);
  const karfreitag = new Date(2026, 3, 3, 10, 0);
  const himmelfahrt = new Date(2026, 4, 14, 10, 0);
  const pfingstmontag = new Date(2026, 4, 25, 10, 0);
  const fronleichnam = new Date(2026, 5, 4, 10, 0);
  const tuesday = new Date(2026, 3, 7, 10, 0);
  assert.equal(isHoliday(ostermontag), true);
  assert.equal(isMovableHoliday(ostermontag), true);
  assert.equal(isHoliday(karfreitag), false);
  assert.equal(isHoliday(himmelfahrt), true);
  assert.equal(isHoliday(pfingstmontag), true);
  assert.equal(isHoliday(fronleichnam), true);
  assert.equal(isHoliday(tuesday), false);
  assert.equal(isHoliday(new Date(2026, 9, 26, 10, 0)), true);
  assert.equal(hoursLabelForDay(PRACTICE.hours, ostermontag), "Feiertag · geschlossen");
  assert.equal(isOpenHourAt(ostermontag, DEFAULT), false);
  assert.equal(deskStatusAt(DEFAULT, ostermontag).code, "feiertag");
  const blocked = walkInBlocked(ostermontag, DEFAULT, []);
  assert.ok(blocked);
  assert.match(blocked.error, /Feiertag/);
  assert.equal(blocked.next.getDate(), 7);
  assert.equal(blocked.next.getMonth(), 3);
  assert.equal(blocked.next.getHours(), 8);
  const slot = nextOpenSlotAt(DEFAULT, ostermontag);
  assert.equal(slot?.getDate(), 7);
  assert.equal(isOpenHourAt(new Date(2026, 7, 25, 15, 0), DEFAULT), true);
});

test("hinterlegte geschlossen days do not fall back to Huber hours", () => {
  const closed = parseHourWindows([
    { day: "Montag", time: "geschlossen · Nachtdienst" },
    { day: "Dienstag", time: "geschlossen" },
    { day: "Mittwoch", time: "zu" },
  ]);
  assert.equal(closed.length, 0);
  const monday = new Date(2026, 7, 24, 10, 0);
  assert.equal(isOpenHourAt(monday, closed), false);
  assert.equal(isOpenHourAt(monday, []), false);
  assert.equal(deskStatusAt([], monday).code, "zu");
  const blocked = walkInBlocked(monday, closed, []);
  assert.ok(blocked);
  assert.match(blocked.error, /Keine hinterlegten Öffnungszeiten/);
  assert.equal(kalenderChipClosedLabel(PRACTICE.hours, new Date(2026, 7, 30, 10, 0)), "zu");
  assert.equal(kalenderChipClosedLabel(PRACTICE.hours, new Date(2026, 7, 27, 10, 0)), "");
  assert.equal(kalenderChipClosedLabel(PRACTICE.hours, new Date(2026, 3, 6, 10, 0)), "Feiertag");
});

test("Huber template still matches itself until a window is edited", () => {
  assert.equal(hoursMatchTemplate(PRACTICE.hours, PRACTICE.hours), true);
  assert.equal(
    hoursMatchTemplate(
      PRACTICE.hours.map((h) => (h.day === "Mittwoch" ? { ...h, time: "8:00–12:00, 14:00–18:00" } : h)),
      PRACTICE.hours,
    ),
    false,
  );
  assert.equal(hoursMatchTemplate([], PRACTICE.hours), false);
});

test("Heute extra-closed seed is the next open weekday, not today", () => {
  assert.equal(nextExtraClosedSeed(SIGNUP_HOURS, "2026-08-28"), "2026-08-31");
  assert.equal(nextExtraClosedSeed(SIGNUP_HOURS, "2026-08-31"), "2026-09-01");
  const mondayClosed = [
    ...SIGNUP_HOURS,
    { day: "2026-08-31", time: SIGNUP_CLOSED_TIME },
  ];
  assert.equal(nextExtraClosedSeed(mondayClosed, "2026-08-28"), "2026-09-01");
  assert.doesNotMatch(nextExtraClosedSeed(SIGNUP_HOURS, "2026-08-28"), /2026-08-28|2026-08-29|2026-08-30/);
  // Weihnachten + Stefanitag: next seed after 24.12. is Monday 28.12.
  assert.equal(nextExtraClosedSeed(SIGNUP_HOURS, "2026-12-24"), "2026-12-28");
});

test("signup hours are Mo–Fr voll, not Huber Mi-vormittags or Sa 9–12", () => {
  const signup = parseHourWindows(SIGNUP_HOURS);
  const wed = new Date(2026, 7, 26, 15, 0);
  const friEvening = new Date(2026, 7, 28, 17, 30);
  const saturday = new Date(2026, 7, 29, 10, 0);
  assert.equal(hoursLabelForDay(SIGNUP_HOURS, wed), "8:00–12:00, 14:00–18:00");
  assert.equal(isOpenHourAt(wed, signup), true);
  assert.equal(isOpenHourAt(friEvening, signup), true);
  assert.equal(isOpenHourAt(saturday, signup), false);
  assert.equal(hoursLabelForDay(SIGNUP_HOURS, saturday), "geschlossen");
  assert.equal(hoursMatchTemplate(SIGNUP_HOURS, PRACTICE.hours), false);
  assert.equal(hoursMatchTemplate(SIGNUP_HOURS, SIGNUP_HOURS), true);
  assert.deepEqual(signupHoursIfStillHuber(PRACTICE.hours, PRACTICE.hours), SIGNUP_HOURS);
  assert.equal(signupHoursIfStillHuber(SIGNUP_HOURS, PRACTICE.hours), null);
  assert.equal(hoursLabelForDay(PRACTICE.hours, wed), "8:00–12:00");
  assert.equal(isOpenHourAt(wed, DEFAULT), false);
  assert.equal(isOpenHourAt(saturday, DEFAULT), true);
});

test("live prompt mentions a lunch pause only when hinterlegte windows have one", () => {
  assert.match(hoursPauseCopy(PRACTICE.hours), /12:00–14:00/);
  assert.doesNotMatch(hoursPauseCopy(PRACTICE.hours), /erfinde|Vetmeduni|Josefstadt/i);
  const through = PRACTICE.hours.map((h) =>
    /sonntag/i.test(h.day) ? h : { ...h, time: "8:00–18:00" },
  );
  assert.match(hoursPauseCopy(through), /Keine pauschale Mittagssperre/);
  assert.doesNotMatch(hoursPauseCopy(through), /12:00–14:00/);
  const morning = [{ day: "Mittwoch", time: "8:00–12:00" }];
  assert.match(hoursPauseCopy(morning), /Keine pauschale Mittagssperre/);
});

test("hours turn is an hours question, not a Saturday booking", () => {
  assert.equal(isHoursTurn("Wann habt ihr offen, auch samstags?"), true);
  assert.equal(isHoursTurn("Seid ihr samstags offen?"), true);
  assert.equal(isHoursTurn("Welche Zeiten habt ihr?"), true);
  assert.equal(isHoursTurn("Mittagssperre?"), true);
  assert.equal(isHoursTurn("Termin am Samstag für Resi"), false);
  assert.equal(isHoursTurn("Impfung für Luna"), false);
  assert.equal(isHoursTurn("Wo kann ich parken?"), false);
});

test("live hours reply uses signup rows, never Huber Sa 9–12", () => {
  const spoken = hoursReply(SIGNUP_HOURS);
  assert.match(spoken, /8:00–12:00, 14:00–18:00/);
  assert.match(spoken, /Samstag geschlossen/);
  assert.doesNotMatch(spoken, /9:00–12:00/);
  assert.doesNotMatch(spoken, /Mittwoch nur|Freitag bis 17/);
  assert.match(hoursReply(PRACTICE.hours), /9:00–12:00/);
  assert.match(hoursReply(PRACTICE.hours), /Mittwoch 8:00–12:00/);
});

test("live hours system rule forbids invented Huber hours", () => {
  assert.equal(hoursSystemRule(SIGNUP_HOURS, true), "");
  const rule = hoursSystemRule(SIGNUP_HOURS, false);
  assert.match(rule, /ORDINATIONSZEITEN/);
  assert.match(rule, /Samstag 9–12|Mittwoch nur vormittags|Freitag bis 17/);
  assert.match(rule, /8:00–12:00, 14:00–18:00/);
  assert.match(rule, /verbindest/);
});

test("live closed-day status never claims Silvia connects Nachtdienst", () => {
  const windows = parseHourWindows(SIGNUP_HOURS);
  const sun = new Date(2026, 7, 30, 10, 0);
  const eve = new Date(2026, 7, 28, 20, 0);
  const ostermontag = new Date(2026, 3, 6, 10, 0);
  const liveSun = deskStatusAt(windows, sun, false);
  assert.equal(liveSun.code, "sonntag");
  assert.match(liveSun.detail, /Tierarzthelferin ruft/);
  assert.match(liveSun.detail, /verbindet nicht selbst/);
  assert.doesNotMatch(liveSun.detail, /Vetmeduni|Ich verbinde/i);
  const liveEve = deskStatusAt(windows, eve, false);
  assert.match(liveEve.detail, /legt den nächsten Slot/);
  assert.match(liveEve.detail, /verbindet nicht selbst/);
  assert.doesNotMatch(liveEve.detail, /Vetmeduni/i);
  const liveHoliday = deskStatusAt(windows, ostermontag, false);
  assert.equal(liveHoliday.code, "feiertag");
  assert.match(liveHoliday.detail, /verbindet nicht selbst/);
  assert.doesNotMatch(liveHoliday.detail, /Vetmeduni/i);
  const demoSun = deskStatusAt(parseHourWindows(PRACTICE.hours), sun, true);
  assert.match(demoSun.detail, /verbindet den hinterlegten Nachtdienst/);
  assert.doesNotMatch(demoSun.detail, /verbindet nicht selbst/);
  assert.match(deskStatus(sun).detail, /Vetmeduni/);
});

test("extra closed date is only that calendar day, not every Thursday", () => {
  const thu = new Date(2026, 7, 27, 15, 0);
  const nextThu = new Date(2026, 8, 3, 15, 0);
  assert.equal(parseHourDayIso("2026-08-27"), "2026-08-27");
  assert.equal(parseHourDayIso("27.8.2026"), "2026-08-27");
  assert.equal(parseHourDayIso("Donnerstag"), null);
  const added = upsertExtraClosedDay(SIGNUP_HOURS, "27.8.2026", "2026-08-27");
  assert.equal(added.ok, true);
  if (!added.ok) return;
  assert.equal(extraClosedOn(added.hours, thu), true);
  assert.equal(extraClosedOn(added.hours, nextThu), false);
  assert.equal(hoursLabelForDay(added.hours, thu), "geschlossen");
  assert.equal(hoursLabelForDay(added.hours, nextThu), "8:00–12:00, 14:00–18:00");
  const windows = parseHourWindows(added.hours);
  assert.equal(isOpenHourAt(thu, windows), false);
  assert.equal(isOpenHourAt(nextThu, windows), true);
  assert.equal(deskStatusAt(windows, thu).code, "zu");
  assert.match(deskStatusAt(windows, thu).label, /geschlossen hinterlegt/);
  const blocked = walkInBlocked(thu, windows, []);
  assert.ok(blocked);
  assert.match(blocked.error, /geschlossen hinterlegt/);
  assert.equal(blocked.next.getDate(), 28);
  assert.equal(blocked.next.getMonth(), 7);
  assert.equal(kalenderChipClosedLabel(added.hours, thu), "zu");
  assert.equal(kalenderChipClosedLabel(added.hours, nextThu), "");
  const again = upsertExtraClosedDay(added.hours, "2026-08-27", "2026-08-27");
  assert.equal(again.ok, false);
  const weekday = hoursRowForDay(added.hours, thu);
  assert.equal(weekday?.day, "Donnerstag");
  const seed = walkInSeedSlot(added.hours, [], thu);
  assert.equal(seed.start.getDate(), 28);
  assert.equal(seed.start.getMonth(), 7);
  assert.equal(seed.time, "08:00");
  assert.deepEqual(extraClosedDays(added.hours), ["2026-08-27"]);
  assert.equal(extraClosedOpenId("2026-08-27"), "heute-zu-offen-2026-08-27");
  assert.equal(kalenderClosedOpenId("2026-09-01"), "kalender-zu-offen-2026-09-01");
  assert.equal(kalenderClosedSaveId(), "kalender-zu-speichern");
  assert.equal(kalenderCanExtraClose(SIGNUP_HOURS, thu, "2026-08-27"), true);
  assert.equal(kalenderCanExtraClose(added.hours, thu, "2026-08-27"), false);
  assert.equal(
    kalenderCanExtraClose(SIGNUP_HOURS, new Date("2026-08-29T10:00:00+02:00"), "2026-08-27"),
    false,
  );
  assert.equal(kalenderCanExtraClose(SIGNUP_HOURS, new Date(2026, 7, 15, 10, 0), "2026-08-27"), false);
  assert.equal(kalenderCanExtraClose(SIGNUP_HOURS, thu, "2026-08-28"), false);
  assert.equal(kalenderClosedEmptyCopy(added.hours, thu), "27.8.2026 geschlossen hinterlegt.");
  assert.equal(kalenderClosedEmptyCopy(added.hours, thu, true), "27.8.2026 geschlossen hinterlegt.");
  assert.equal(
    kalenderClosedEmptyCopy(SIGNUP_HOURS, new Date("2026-08-29T10:00:00+02:00")),
    "An diesem Tag ist geschlossen.",
  );
  assert.equal(
    kalenderClosedEmptyCopy(SIGNUP_HOURS, new Date("2026-09-01T10:00:00+02:00")),
    KALENDER_EMPTY_COPY,
  );
  assert.equal(
    kalenderClosedEmptyCopy(SIGNUP_HOURS, new Date("2026-09-01T10:00:00+02:00"), false),
    KALENDER_EMPTY_COPY,
  );
  assert.equal(
    kalenderClosedEmptyCopy(SIGNUP_HOURS, new Date("2026-09-01T10:00:00+02:00"), true),
    KALENDER_EMPTY_COPY_ANZEIGE,
  );
  assert.match(KALENDER_EMPTY_COPY, /legen einen Slot/);
  assert.doesNotMatch(KALENDER_EMPTY_COPY_ANZEIGE, /Walk-in|legen|Silvia|Tierarzthelferin/);
  assert.match(KALENDER_EMPTY_COPY_ANZEIGE, /Schreib-Rechner/);
  assert.equal(
    kalenderClosedEmptyCopy(SIGNUP_HOURS, new Date("2026-10-26T10:00:00+02:00")),
    KALENDER_HOLIDAY_EMPTY_COPY,
  );
  assert.equal(
    kalenderClosedEmptyCopy(SIGNUP_HOURS, new Date("2026-10-26T10:00:00+02:00"), true),
    KALENDER_HOLIDAY_EMPTY_COPY_ANZEIGE,
  );
  assert.match(KALENDER_HOLIDAY_EMPTY_COPY, /Walk-in/);
  assert.doesNotMatch(KALENDER_HOLIDAY_EMPTY_COPY_ANZEIGE, /Walk-in|legen|Werktag/);
  assert.equal(formatHourDayAt("2026-08-27"), "27.8.2026");
  assert.equal(formatHourDayAt("27.8.2026"), "27.8.2026");
  assert.equal(formatHourTimeAt("08:00"), "08:00");
  assert.equal(formatHourTimeAt("17:00"), "17:00");
  assert.equal(formatHourTimeAt("5:00"), "05:00");
  assert.equal(formatHourTimeAt("17:00:00"), "17:00");
  assert.equal(formatHourTimeAt("5:00 PM"), "05:00");
  const opened = removeExtraClosedDay(added.hours, "27.8.2026");
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  assert.equal(extraClosedOn(opened.hours, thu), false);
  assert.equal(hoursRowForDay(opened.hours, thu)?.day, "Donnerstag");
  const seedOpen = walkInSeedSlot(opened.hours, [], new Date(2026, 7, 27, 7, 0));
  assert.equal(seedOpen.start.getDate(), 27);
  assert.equal(seedOpen.start.getMonth(), 7);
  assert.equal(seedOpen.time, "08:00");
  assert.deepEqual(extraClosedDays(opened.hours), []);
  const missing = removeExtraClosedDay(SIGNUP_HOURS, "2026-08-27");
  assert.equal(missing.ok, false);
  const past = upsertExtraClosedDay(SIGNUP_HOURS, "2026-08-01", "2026-08-27");
  assert.equal(past.ok, false);
  if (!past.ok) assert.equal(past.error, EXTRA_CLOSED_PAST_ERROR);
  const stale = [
    ...SIGNUP_HOURS,
    ...Array.from({ length: MAX_HOUR_ROWS - SIGNUP_HOURS.length }, (_, i) => ({
      day: `2026-07-${String(10 + i).padStart(2, "0")}`,
      time: SIGNUP_CLOSED_TIME,
    })),
  ];
  assert.equal(stale.length, MAX_HOUR_ROWS);
  assert.equal(extraClosedRoom(stale, "2026-08-27"), true);
  assert.equal(kalenderCanExtraClose(stale, thu, "2026-08-27"), true);
  assert.deepEqual(extraClosedUpcoming(stale, "2026-08-27"), []);
  assert.equal(prunePastExtraClosed(stale, "2026-08-27").length, SIGNUP_HOURS.length);
  const booked = [
    ...SIGNUP_HOURS,
    ...Array.from({ length: MAX_HOUR_ROWS - SIGNUP_HOURS.length }, (_, i) => ({
      day: `2026-09-${String(10 + i).padStart(2, "0")}`,
      time: SIGNUP_CLOSED_TIME,
    })),
  ];
  assert.equal(extraClosedRoom(booked, "2026-08-27"), false);
  assert.equal(kalenderCanExtraClose(booked, thu, "2026-08-27"), false);
  const afterPrune = upsertExtraClosedDay(stale, "2026-09-01", "2026-08-27");
  assert.equal(afterPrune.ok, true);
  if (!afterPrune.ok) return;
  assert.deepEqual(extraClosedUpcoming(afterPrune.hours, "2026-08-27"), ["2026-09-01"]);
  assert.equal(afterPrune.hours.some((row) => row.day.startsWith("2026-07-")), false);
});

test("Kalender walk-in seeds the selected chip, not now, and skips extra-closed days", () => {
  const now = new Date(2026, 7, 27, 15, 10);
  const thu = new Date(2026, 8, 3, 10, 0);
  const sat = new Date(2026, 8, 5, 10, 0);
  const fromNow = walkInSeedSlot(SIGNUP_HOURS, [], now);
  assert.equal(fromNow.start.getDate(), 27);
  assert.equal(fromNow.start.getMonth(), 7);
  const open = walkInFromDay(SIGNUP_HOURS, [], thu, now);
  assert.equal(open.start.getDate(), 3);
  assert.equal(open.start.getMonth(), 8);
  assert.equal(open.time, "08:00");
  assert.notEqual(dayIso(open.start), dayIso(fromNow.start));
  const weekend = walkInFromDay(SIGNUP_HOURS, [], sat, now);
  assert.equal(weekend.start.getDay(), 1);
  assert.equal(weekend.start.getDate(), 7);
  assert.equal(weekend.time, "08:00");
  const closed = upsertExtraClosedDay(SIGNUP_HOURS, "2026-09-03", "2026-08-27");
  assert.equal(closed.ok, true);
  if (!closed.ok) return;
  const next = walkInFromDay(closed.hours, [], thu, now);
  assert.equal(next.start.getDate(), 4);
  assert.equal(next.start.getMonth(), 8);
  assert.equal(next.start.getDay(), 5);
  assert.equal(next.time, "08:00");
  const todayShut = upsertExtraClosedDay(SIGNUP_HOURS, "2026-08-27", "2026-08-27");
  assert.equal(todayShut.ok, true);
  if (!todayShut.ok) return;
  const jumped = walkInFromDay(todayShut.hours, [], now, now);
  assert.equal(jumped.start.getDate(), 28);
  assert.equal(jumped.start.getMonth(), 7);
  assert.equal(jumped.time, "08:00");
  assert.equal(dayIsWalkInClosed(SIGNUP_HOURS, thu), false);
  assert.equal(dayIsWalkInClosed(closed.hours, thu), true);
  assert.equal(dayIsWalkInClosed(SIGNUP_HOURS, sat), true);
  assert.equal(dayIsWalkInClosed(SIGNUP_HOURS, new Date(2026, 3, 6, 10, 0)), true);
  assert.equal(dayIsWalkInClosed([], thu), false);
  const kept = retargetClosedDayStart(SIGNUP_HOURS, [], new Date(2026, 8, 4, 8, 30), now);
  assert.equal(kept.getDate(), 4);
  assert.equal(kept.getHours(), 8);
  assert.equal(kept.getMinutes(), 30);
  const moved = retargetClosedDayStart(closed.hours, [], new Date(2026, 8, 3, 10, 0), now);
  assert.equal(moved.getDate(), 4);
  assert.equal(moved.getMonth(), 8);
  assert.equal(moved.getHours(), 8);
  assert.equal(moved.getMinutes(), 0);
  const satJump = retargetClosedDayStart(SIGNUP_HOURS, [], sat, now);
  assert.equal(satJump.getDay(), 1);
  assert.equal(satJump.getDate(), 7);
});
