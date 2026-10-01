import { dayIso, isOpenRangeAt, nextFreeSlotAt, occupyingSlot, parseHourWindows, SLOT_MINUTES, viennaNow, type HourRow } from "./hours.ts";
import type { OccupiedSlot } from "./hours.ts";

export type AppointmentPreference =
  | { kind: "date"; date: string }
  | { kind: "dateTime"; date: string; time: string }
  | { kind: "unclear" };

/** Erster freier Slot ausschließlich am gewünschten, validierten Kalendertag. */
export function nextLocalRequestedSlot(
  hours: HourRow[],
  occupied: OccupiedSlot[],
  requestedDate: string,
  now: Date = viennaNow(),
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return null;
  const requested = new Date(`${requestedDate}T00:00:00`);
  if (Number.isNaN(requested.getTime()) || dayIso(requested) !== requestedDate) return null;
  if (requestedDate < dayIso(now)) return null;
  const windows = parseHourWindows(hours);
  if (!windows.length) return null;
  const from = requestedDate === dayIso(now) ? now : requested;
  const slot = nextFreeSlotAt(windows, occupied, from);
  // Punkt 16: kein freier Termin ist ein Ergebnis, kein Datum.
  if (!slot) return null;
  if (dayIso(slot) !== requestedDate || !isOpenRangeAt(slot, SLOT_MINUTES, windows) || occupyingSlot(slot, SLOT_MINUTES, occupied)) return null;
  return slot;
}

/**
 * Ein konkretes Kalenderdatum: Tag.Monat.Jahr, mit Punkt, Schraegstrich oder
 * Bindestrich. Das Jahr ist optional, dann gilt das naechste Vorkommen.
 * Oesterreichische Schreibweise ist Tag vor Monat (18.09. = 18. September).
 */
const CALENDAR_DATE = /(?<![\d.])(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*(?:[.\-/]\s*(\d{2,4}))?(?![\d])/g;

/**
 * Prueft ein Kalenderdatum und liefert es als ISO-Datum.
 *
 * Gibt `null` zurueck, wenn das Datum unmoeglich ist (31. Februar, Monat 13,
 * 32. Tag) — dann darf kein Termin entstehen. Gibt `"past"` zurueck, wenn der
 * Tag vor heute liegt; auch das ist kein gueltiger Terminwunsch.
 */
function parseCalendarDate(
  day: number,
  month: number,
  year: number | undefined,
  now: Date,
): { iso: string } | "invalid" | "past" | null {
  if (month < 1 || month > 12) return "invalid";
  if (day < 1 || day > 31) return "invalid";
  // Zwei Stellen: 26 -> 2026, 99 -> 1999 (Vergangenheit, wird unten abgelehnt).
  const resolvedYear = year === undefined
    ? now.getFullYear()
    : year < 100 ? (year >= 70 ? 1900 + year : 2000 + year) : year;
  const date = new Date(resolvedYear, month - 1, day);
  // Ein ueberlaufender Tag (31. Februar) rollt in den Folgemonat.
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return "invalid";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date < today) {
    // Ohne Jahresangabe ist ein vergangener Tag im naechsten Jahr gemeint.
    if (year === undefined) {
      const nextYear = new Date(resolvedYear + 1, month - 1, day);
      if (nextYear.getMonth() === month - 1 && nextYear.getDate() === day) {
        return { iso: isoDate(nextYear) };
      }
    }
    return "past";
  }
  return { iso: isoDate(date) };
}

/**
 * Alle genannten Kalenderdaten mit Position.
 *
 * `iso` ist `null`, wenn das Datum unmoeglich oder vergangen ist — dann darf
 * kein Termin entstehen, sondern es braucht eine Rueckfrage.
 *
 * Eine zweiteilige Angabe ohne Jahr gilt nur als Datum, wenn der Monat
 * plausibel ist. Sonst waere „8.30 Uhr“ ein Datum (Tag 8, Monat 30) und
 * wuerde eine gueltige Uhrzeit unbrauchbar machen.
 */
function allCalendarDates(text: string, now: Date): Array<{ at: number; iso: string | null }> {
  const found: Array<{ at: number; iso: string | null }> = [];
  for (const match of text.matchAll(CALENDAR_DATE)) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const yearRaw = match[3];
    const year = yearRaw === undefined ? undefined : Number(yearRaw);
    if (yearRaw === undefined && (month < 1 || month > 12)) continue;
    const parsed = parseCalendarDate(day, month, year, now);
    if (parsed === null) continue;
    found.push({
      at: match.index ?? 0,
      iso: parsed === "invalid" || parsed === "past" ? null : parsed.iso,
    });
  }
  return found;
}

const WEEKDAYS: Record<string, number> = {
  sonntag: 0,
  montag: 1,
  dienstag: 2,
  mittwoch: 3,
  donnerstag: 4,
  freitag: 5,
  samstag: 6,
};

/** Alle relativen Tagesangaben („heute“, „morgen“, „übermorgen“) mit Position. */
function allRelatives(text: string): Array<{ at: number; offset: number }> {
  const pattern = /(?<!guten\s)(?<!guten\u00a0)(?<!gute\s)(?<![\p{L}])(heute|morgen|übermorgen)(?![\p{L}])/giu;
  const found: Array<{ at: number; offset: number }> = [];
  for (const match of text.matchAll(pattern)) {
    const word = match[1].toLowerCase();
    found.push({
      at: match.index ?? 0,
      offset: word === "heute" ? 0 : word === "morgen" ? 1 : 2,
    });
  }
  return found;
}

/** Alle Wochentagsnennungen mit Position. „nächsten Montag“ zählt nicht. */
function allWeekdays(text: string): Array<{ at: number; target: number }> {
  const pattern = /(?<![\p{L}])(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)(?![\p{L}])/giu;
  const found: Array<{ at: number; target: number }> = [];
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    // „nächsten Montag“ ist keine eindeutige Angabe und wird gesondert gemeldet.
    if (/\bnächsten\s*$/i.test(text.slice(Math.max(0, at - 10), at))) continue;
    found.push({ at, target: WEEKDAYS[match[1].toLowerCase()] });
  }
  return found;
}

/**
 * Löst „X statt Y“ und „nicht Y, sondern X“ auf: X gewinnt.
 * Die Position ist der Anfang der ganzen Wendung, damit sie spätere
 * Einzelangaben im selben Satz überstimmt.
 */
function stattCorrection(text: string, now: Date): { at: number; iso: string } | null {
  const wd = /(?<![\p{L}])(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)(?![\p{L}])\s+statt\s+(?<![\p{L}])(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)(?![\p{L}])/iu.exec(text);
  if (wd) {
    const delta = (WEEKDAYS[wd[1].toLowerCase()] - now.getDay() + 7) % 7;
    return { at: wd.index ?? 0, iso: isoDate(addDays(now, delta)) };
  }
  const rel = /(?<![\p{L}])(heute|morgen|übermorgen)\s+statt\s+(heute|morgen|übermorgen)(?![\p{L}])/iu.exec(text)
    ?? /(?<![\p{L}])(?:nicht\s+)?(heute|morgen|übermorgen)\s*,?\s+sondern\s+(heute|morgen|übermorgen)(?![\p{L}])/iu.exec(text);
  if (rel) {
    const word = rel[0].includes("statt") ? rel[1].toLowerCase() : rel[2].toLowerCase();
    const offset = word === "heute" ? 0 : word === "morgen" ? 1 : 2;
    return { at: rel.index ?? 0, iso: isoDate(addDays(now, offset)) };
  }
  return null;
}

/** Position des letzten Treffers eines Musters, oder `null`. */
function lastIndex(text: string, pattern: RegExp): number | null {
  let at: number | null = null;
  for (const match of text.matchAll(pattern)) at = match.index ?? 0;
  return at;
}

/**
 * Alle Tagesangaben mit Position. `iso: null` heisst: keine eindeutige
 * Entscheidung (unmoegliches Datum, Auswahl, zurückgenommener Wunsch).
 *
 * Die späteste Angabe entscheidet — sie ist die Korrektur des Gesprächs.
 * Damit gilt eine spätere Korrektur auch dann, wenn vorher ein konkretes
 * Kalenderdatum genannt wurde.
 */
function dayDecisions(text: string, now: Date): Array<{ at: number; iso: string | null }> {
  const out: Array<{ at: number; iso: string | null }> = [];
  const statt = stattCorrection(text, now);
  const weekdays = allWeekdays(text);
  const dates = allCalendarDates(text, now);
  const relatives = allRelatives(text).map((r) => ({
    at: r.at,
    iso: isoDate(addDays(now, r.offset)),
  }));

  // „egal wann“ / „irgendwann“ nimmt den Wunsch zurück.
  const openAt = lastIndex(text, /\b(?:egal\s+wann|irgendwann|nächste\s+Woche|kommende\s+Woche)\b/giu);
  if (openAt !== null) out.push({ at: openAt, iso: null });

  // „nächsten Montag“ ist keine eindeutige Angabe.
  const nextAt = lastIndex(text, /\bnächsten\s+(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)\b/giu);
  if (nextAt !== null) out.push({ at: nextAt, iso: null });

  if (statt) {
    // Die aufgelöste Korrektur ersetzt die Einzelangaben.
    out.push({ at: statt.at, iso: statt.iso });
  } else {
    for (const r of relatives) out.push({ at: r.at, iso: r.iso });
    for (const w of weekdays) {
      const delta = (w.target - now.getDay() + 7) % 7;
      out.push({ at: w.at, iso: isoDate(addDays(now, delta)) });
    }
  }

  // Zwei Kalenderdaten sind eine Auswahl, kein Wunsch.
  if (dates.length > 1) {
    out.push({ at: dates[dates.length - 1].at, iso: null });
  } else if (dates.length === 1) {
    out.push({ at: dates[0].at, iso: dates[0].iso });
  }

  // Zwei Wochentage ohne „statt“ ebenso.
  if (!statt && weekdays.length > 1) {
    out.push({ at: weekdays[weekdays.length - 1].at, iso: null });
  }

  // „heute oder morgen“ ist eine Auswahl.
  if (!statt && relatives.length > 1 && /\b(?:oder|bis)\b/i.test(text)) {
    out.push({ at: relatives[relatives.length - 1].at, iso: null });
  }

  return out;
}

/**
 * Eine einzelne Zeitangabe mit ihrer Position im Text.
 *
 * `unclear` markiert eine als Uhrzeit gemeinte, aber nicht eindeutige oder
 * unmoegliche Angabe („25 Uhr“, „15:3“, „15 oder 16 Uhr“). Sie gewinnt als
 * spaeteste Angabe und fuehrt dann zu einer Rueckfrage, statt still eine
 * falsche Zeit zu setzen.
 */
type TimeHit =
  | { at: number; kind: "time"; value: string }
  | { at: number; kind: "solid"; value: string }
  | { at: number; kind: "open" }
  | { at: number; kind: "unclear" };

/** Wortzeiten: die Stunde, auf die es zugeht (oesterreichische Lesart). */
const WORD_TIME =
  /\b(?:dreiviertel|viertel(?:\s+(?:vor|nach))?|halb)\s+([a-z\u00e4\u00f6\u00fc\u00df]+)\b/gi;

/**
 * Tageshaelfte fuer eine Wortzeit.
 *
 * Wichtig: `morgen` allein bedeutet hier „naechster Tag“ und ist KEINE
 * Tageszeit. Frueher traf das Muster auf jedes „morgen“ zu und unterdrueckte
 * die Nachmittags-Anhebung, sodass „halb fuenf“ zu 04:30 statt 16:30 wurde.
 * Nur eindeutige Tageszeit-Woerter zaehlen.
 */
const EVENING = /\b(?:abends?|nachts?|am\s+abend|heute\s+abend)\b/i;
const MORNING = /\b(?:morgens|fr(?:ue|\u00fc)h|am\s+morgen|in\s+der\s+fr(?:ue|\u00fc)h)\b/i;

/**
 * Zahlenangabe: „um 15 Uhr“, „15 Uhr“, „um 15:30“, „15:30 Uhr“.
 *
 * Auch mit Punkt als Minutentrenner („8.30 Uhr“), wie es am Telefon diktiert
 * wird — aber nur zusammen mit „Uhr“, damit ein Datum wie „18.09.“ nicht als
 * Uhrzeit gelesen wird.
 *
 * Die Sperre vor der Stunde verhindert, dass ein Bruchstück wie die 30 in
 * „8.30“ allein als Stunde gilt und daraus eine unmoegliche Uhrzeit wird.
 */
const NUMERIC_TIME =
  /(?:\bum\s*)?(?<![\d.,\-/])(\d{1,2})(?:[:.](\d{1,2}))?\s*Uhr\b|\bum\s*(\d{1,2})(?::(\d{1,2}))?\b/gi;

/** Eine Auswahl mehrerer Uhrzeiten: „15 oder 16 Uhr“, „15 bis 16 Uhr“. */
const TIME_CHOICE = /\b\d{1,2}(?::\d{2})?\s*(?:oder|bis|bis\s+zu)\s*\d{1,2}(?::\d{2})?\s*Uhr\b/i;

/** Wandelt eine Wortzeit in HH:MM. `null`, wenn keine sichere Deutung moeglich ist. */
function parseWordTime(text: string, at: number): TimeHit | null {
  const match = [...text.matchAll(WORD_TIME)].find((m) => (m.index ?? 0) >= at - 1);
  if (!match) return null;
  const word = match[1].toLowerCase();
  const hour = HOUR_WORDS[word];
  if (hour === undefined) return null;
  const prefix = match[0].toLowerCase();
  const position = match.index ?? 0;

  // Tageshaelfte aus dem Text: „halb acht abends“ ist 19:30, nicht 07:30.
  const evening = EVENING.test(text);
  const morning = !evening && MORNING.test(text);

  let minutes: number;
  if (prefix.startsWith("dreiviertel")) minutes = hour * 60 - 15;
  else if (prefix.startsWith("viertel vor")) minutes = hour * 60 - 15;
  else if (prefix.startsWith("viertel nach")) minutes = hour * 60 + 15;
  else if (prefix.startsWith("viertel")) minutes = hour * 60 - 45;
  else minutes = hour * 60 - 30;

  let total = ((minutes % 1440) + 1440) % 1440;
  if (evening) {
    // Abends: eine Uhrzeit vor 12:00 gehoert auf den Nachmittag/Abend.
    if (total < 12 * 60) total += 12 * 60;
  } else if (!morning && total < 7 * 60) {
    // Ordinationszeit (Owner-Entscheid): eine Uhrzeit vor 07:00 stammt aus der
    // zwoelfstundigen Sprechweise und wird auf den Nachmittag gehoben.
    total += 12 * 60;
  }
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return { at: position, kind: "time", value: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` };
}

/**
 * Alle Zeitangaben im Text mit Position und Deutlichkeit.
 *
 * Reihenfolge und Auswahl sind bewusst positionsbasiert: Die spaeteste Angabe
 * gewinnt, weil sie die Korrektur ist. Eine Angabe, die als Uhrzeit gemeint,
 * aber unmoeglich oder mehrdeutig ist, gewinnt ebenfalls und fuehrt zu einer
 * Rueckfrage — statt still eine falsche Zeit zu setzen.
 */
function timeHits(text: string): TimeHit[] {
  const hits: TimeHit[] = [];

  // Eine Auswahl („15 oder 16 Uhr“) ist keine eindeutige Zeit. Sie wird an der
  // Position ihres ENDES eingetragen, damit sie die enthaltenen Einzelzeiten
  // ueberstimmt — sonst gewaenne die spaetere Zahl und die Rueckfrage entfiele.
  const choice = TIME_CHOICE.exec(text);
  if (choice) {
    const end = (choice.index ?? 0) + choice[0].length;
    // Die Einzelzeiten der Auswahl nicht zusaetzlich als feste Zeiten werten.
    const coveredFrom = choice.index ?? 0;
    hits.push({ at: end, kind: "open" });
    for (const match of text.matchAll(NUMERIC_TIME)) {
      const at = match.index ?? 0;
      if (at >= coveredFrom && at < end) continue;
      pushNumericHit(hits, match);
    }
    pushWordHits(hits, text, coveredFrom, end);
    return hits.sort((a, b) => a.at - b.at);
  }

  for (const match of text.matchAll(NUMERIC_TIME)) pushNumericHit(hits, match);
  pushWordHits(hits, text, -1, -1);
  return hits.sort((a, b) => a.at - b.at);
}

/** Eine Zahlenangabe als Treffer eintragen (fest oder unklar). */
function pushNumericHit(hits: TimeHit[], match: RegExpMatchArray) {
  const hourRaw = match[1] ?? match[3];
  if (hourRaw === undefined) return;
  const minuteRaw = match[2] ?? match[4];
  const hour = Number(hourRaw);
  const position = match.index ?? 0;
  if (hour > 23) {
    hits.push({ at: position, kind: "unclear" });
    return;
  }
  if (minuteRaw === undefined) {
    hits.push({ at: position, kind: "solid", value: `${String(hour).padStart(2, "0")}:00` });
    return;
  }
  const minute = Number(minuteRaw);
  // Ein einstelliger Minutenrest („15:3“) ist keine eindeutige Uhrzeit.
  if (minuteRaw.length < 2 || minute > 59) {
    hits.push({ at: position, kind: "unclear" });
    return;
  }
  hits.push({ at: position, kind: "solid", value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` });
}

/** Wortzeiten als Treffer eintragen; ein Bereich kann ausgenommen werden. */
function pushWordHits(hits: TimeHit[], text: string, skipFrom: number, skipTo: number) {
  for (const match of text.matchAll(WORD_TIME)) {
    const at = match.index ?? 0;
    if (skipFrom >= 0 && at >= skipFrom && at < skipTo) continue;
    const hit = parseWordTime(text, at);
    if (hit && !hits.some((h) => h.kind !== "open" && h.at === hit.at)) hits.push(hit);
  }
}

/** Die spaeteste Zeitangabe entscheidet. */
function lastTimeHit(text: string): TimeHit | null {
  const hits = timeHits(text);
  return hits.length ? hits[hits.length - 1] : null;
}


/**
 * Wortzeitangaben in oesterreichischer Lesart.
 *
 * In Oesterreich zaehlt die Stunde, auf die es zugeht:
 *   „halb vier“        = 15:30  (nicht 16:30 wie im Norden)
 *   „viertel vier“     = 15:15
 *   „dreiviertel vier“ = 15:45
 * Dazu die hochdeutschen Formen „viertel nach zwei“ (14:15) und
 * „viertel vor drei“ (14:45).
 */
const HOUR_WORDS: Record<string, number> = {
  eins: 1, ein: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7,
  acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
};

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

/** Liefert nur eindeutig genannte Tage; freie Wünsche wie „nächste Woche“ bleiben offen. */
export function appointmentPreference(
  messages: readonly string[],
  now: Date = viennaNow(),
): AppointmentPreference | null {
  const allText = messages.join(" ");
  // Die spaeteste Zeitangabe entscheidet. Ist sie unklar (unmoeglich, mehrdeutig
  // oder eine Auswahl), ergibt das eine Rueckfrage statt einer falschen Zeit.
  const hit = lastTimeHit(allText);
  const time = hit?.kind === "time" || hit?.kind === "solid" ? hit.value : null;
  if (hit?.kind === "unclear" || hit?.kind === "open") return { kind: "unclear" };
  // Eine ungenaue Tageszeit („Vormittag“) bleibt eine Rueckfrage.
  if (/\b(?:vormittag|nachmittag)\b/i.test(allText) && !time) return { kind: "unclear" };
  // Tag: Die späteste Angabe entscheidet, damit eine spätere Korrektur auch
  // ein vorher genanntes Kalenderdatum überstimmt („18.09.“ … „Nein, Montag“).
  // Eine Auswahl oder ein unmögliches Datum ergibt eine Rückfrage.
  const decisions = dayDecisions(allText, now);
  if (decisions.length) {
    decisions.sort((a, b) => a.at - b.at);
    const last = decisions[decisions.length - 1];
    if (last.iso === null) return { kind: "unclear" };
    return time
      ? { kind: "dateTime", date: last.iso, time }
      : { kind: "date", date: last.iso };
  }
  // Ohne eindeutigen Tag: Eine genannte Uhrzeit oder ein unbestimmter Zeitraum
  // braucht eine Rückfrage, sonst liegt keine Terminabsicht vor.
  if (time) return { kind: "unclear" };
  if (/\b(?:nächste\s+Woche|kommende\s+Woche|irgendwann|egal\s+wann)\b/i.test(allText)) {
    return { kind: "unclear" };
  }
  return null;
}
