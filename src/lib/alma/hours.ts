/** Vienna-local time helpers for Mittagssperre, Feiertage, next slot. */

import { isLeftoverNamelessHeuteSlot } from "../practice/board-window.ts";

const TZ = "Europe/Vienna";

export type HourRow = { day: string; time: string };

export type DayWindow = { day: number; startMin: number; endMin: number };

export type OccupiedSlot = { start: Date; minutes: number; pet?: string };

/** Mo–Fr 8–12 and 14–18; weekend closed. Matches the Einstellungen voll/zu chips. Not Huber. */
export const SIGNUP_WEEKDAY_TIME = "8:00–12:00, 14:00–18:00";
export const SIGNUP_CLOSED_TIME = "geschlossen · Nachtdienst";

export const SIGNUP_HOURS: HourRow[] = [
  { day: "Montag", time: SIGNUP_WEEKDAY_TIME },
  { day: "Dienstag", time: SIGNUP_WEEKDAY_TIME },
  { day: "Mittwoch", time: SIGNUP_WEEKDAY_TIME },
  { day: "Donnerstag", time: SIGNUP_WEEKDAY_TIME },
  { day: "Freitag", time: SIGNUP_WEEKDAY_TIME },
  { day: "Samstag", time: SIGNUP_CLOSED_TIME },
  { day: "Sonntag", time: SIGNUP_CLOSED_TIME },
];

/** Weekdays plus a few extra closed dates (Fortbildung, Betriebsurlaub). */
export const MAX_HOUR_ROWS = 16;

/** True while a live Tafel still has Huber demo hours (Mi-vormittags / Sa 9–12). */
export function hoursMatchTemplate(hours: HourRow[], template: HourRow[]) {
  if (!hours.length || hours.length !== template.length) return false;
  return hours.every(
    (row, i) => row.day === template[i]?.day && row.time === template[i]?.time,
  );
}

/** Copy of signup hours when the Tafel is still on Huber — otherwise null (already customized). */
export function signupHoursIfStillHuber(
  hours: HourRow[],
  huber: HourRow[],
): HourRow[] | null {
  if (!hoursMatchTemplate(hours, huber)) return null;
  return SIGNUP_HOURS.map((row) => ({ day: row.day, time: row.time }));
}

/** Caller asked about opening hours, not a Saturday booking. */
export function isHoursTurn(message: string) {
  const t = message.toLowerCase();
  if (
    /termin|impfung|kastration|kontrolle|lahm|rückruf|verbinden/.test(t) &&
    !/offen|öffnung|zeiten|mittagssperre/.test(t)
  ) {
    return false;
  }
  return /öffnungszeiten|habt ihr offen|seid ihr offen|wann (habt|seid) ihr|wie lange offen|bis wann offen|samstags?\s+(offen|geöffnet|zu|geschlossen)|sonntags?\s+(offen|geöffnet|zu|geschlossen)|am samstag.{0,20}(offen|geöffnet)|mittagssperre|mittags\s+(zu|geschlossen)|welche zeiten|eure zeiten|am wochenende|heute?\s+(zu|offen|geöffnet|geschlossen)/.test(
    t,
  );
}

/** Spoken hours from hinterlegte rows. Live never adds Huber Sa 9–12 / Mi vormittags / Fr 17. */
export function hoursReply(hours: HourRow[]) {
  const status = deskStatusAt(parseHourWindows(hours));
  const listed = hours.map((h) => `${h.day} ${h.time}`).join("; ");
  return `Unsere Zeiten: ${listed}. Jetzt: ${status.label}.`;
}

/** Live model must not invent Huber demo hours when the Tafel has other rows. */
export function hoursSystemRule(hours: HourRow[], isDemo: boolean) {
  if (isDemo) return "";
  const listed = hours.map((h) => `${h.day} ${h.time}`).join("; ");
  return `ORDINATIONSZEITEN: Nur ${listed}. Erfinde keinen Samstag 9–12, keinen Mittwoch nur vormittags und keinen Freitag bis 17:00, wenn das nicht in diesen Zeilen steht. Sage nicht, dass du den Nachtdienst selbst verbindest.`;
}

/** Live prompt: only mention a lunch pause if hinterlegte windows have one. Never invent 12–14. */
export function hoursPauseCopy(hours: HourRow[]) {
  const windows = parseHourWindows(hours);
  const pauses = new Set<string>();
  for (let day = 1; day <= 5; day++) {
    const today = windows
      .filter((w) => w.day === day)
      .sort((a, b) => a.startMin - b.startMin);
    for (let i = 0; i < today.length - 1; i++) {
      const a = today[i]!.endMin;
      const b = today[i + 1]!.startMin;
      if (b - a >= 30) pauses.add(`${formatMinutes(a)}–${formatMinutes(b)}`);
    }
  }
  if (!pauses.size) {
    return "Keine pauschale Mittagssperre. Sage nur die hinterlegten Fenster, auch am Nachmittag wenn eines offen ist.";
  }
  return `Zwischen ${[...pauses].join(" oder ")} oft geschlossen, wenn die hinterlegten Fenster das so zeigen. Sage die hinterlegten Zeiten, nicht das Wort Mittagssperre.`;
}

const WEEKDAY: Record<string, number> = {
  sonntag: 0,
  montag: 1,
  dienstag: 2,
  mittwoch: 3,
  donnerstag: 4,
  freitag: 5,
  samstag: 6,
};

export function dayIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** `2026-08-27` or `27.8.2026` — a single calendar day, not every Thursday. */
export function parseHourDayIso(raw: string): string | null {
  const t = String(raw ?? "").trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const stamp = new Date(y, m - 1, d, 12, 0, 0);
    if (
      stamp.getFullYear() !== y ||
      stamp.getMonth() !== m - 1 ||
      stamp.getDate() !== d
    )
      return null;
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const at = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!at) return null;
  const d = Number(at[1]);
  const m = Number(at[2]);
  const y = Number(at[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const stamp = new Date(y, m - 1, d, 12, 0, 0);
  if (
    stamp.getFullYear() !== y ||
    stamp.getMonth() !== m - 1 ||
    stamp.getDate() !== d
  )
    return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function isClosedTime(time: string) {
  const t = String(time ?? "").trim();
  return Boolean(t) && !/\d/.test(t) && /geschlossen|nachtdienst|^zu$/i.test(t);
}

export function extraClosedOn(hours: HourRow[], day: Date) {
  const key = dayIso(day);
  return hours.some(
    (row) => parseHourDayIso(row.day) === key && isClosedTime(row.time),
  );
}

export const EXTRA_CLOSED_FULL_ERROR =
  "Bitte zuerst eine Zeile in den Zeiten entfernen.";
export const EXTRA_CLOSED_DAY_ERROR =
  "Bitte einen Tag als 2026-08-27 oder 27.8.2026 eintragen.";
export const EXTRA_CLOSED_ALREADY =
  "Dieser Tag ist schon geschlossen hinterlegt.";
export const EXTRA_CLOSED_MISSING =
  "Dieser Tag ist nicht extra geschlossen hinterlegt.";
export const EXTRA_CLOSED_PAST_ERROR =
  "Bitte einen heutigen oder späteren Tag hinterlegen.";

/** Drop extra closed dates before `today` so Fortbildung last month does not fill MAX_HOUR_ROWS. */
export function prunePastExtraClosed(
  hours: HourRow[],
  today = dayIso(new Date()),
): HourRow[] {
  return hours.filter((row) => {
    const iso = parseHourDayIso(row.day);
    if (!iso || !isClosedTime(row.time)) return true;
    return iso >= today;
  });
}

/** Room for another extra-closed date after dropping past Fortbildung rows. */
export function extraClosedRoom(hours: HourRow[], today = dayIso(new Date())) {
  return prunePastExtraClosed(hours, today).length < MAX_HOUR_ROWS;
}

/** Extra closed calendar days from today on, unique, sorted. Weekday rows stay out. */
export function extraClosedUpcoming(
  hours: HourRow[],
  today = dayIso(new Date()),
): string[] {
  return extraClosedDays(hours).filter((iso) => iso >= today);
}

/** `2026-08-27` → `27.8.2026` for Heute toasts and the extra-closed list. */
export function formatHourDayAt(raw: string) {
  const iso = parseHourDayIso(raw);
  if (!iso) return String(raw ?? "").trim();
  const [, y, m, d] = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  if (!y || !m || !d) return iso;
  return `${Number(d)}.${Number(m)}.${y}`;
}

/** `17:00` / `5:00` → `17:00`. Native time pickers may show AM/PM; the value stays 24h. */
export function formatHourTimeAt(raw: string) {
  const t = String(raw ?? "").trim();
  const hm = t.match(/^(\d{1,2}):(\d{2})/);
  if (!hm) return t;
  const h = Number(hm[1]);
  const m = Number(hm[2]);
  if (h > 23 || m > 59) return t;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function extraClosedOpenId(iso: string) {
  return `heute-zu-offen-${iso}`;
}

export function kalenderClosedOpenId(iso: string) {
  return `kalender-zu-offen-${iso}`;
}

export function kalenderClosedSaveId() {
  return "kalender-zu-speichern";
}

/** Heute Tag hinterlegen: next open weekday, not today, not weekend/Feiertag, not already zu. Today stays pickable. */
export function nextExtraClosedSeed(
  hours: HourRow[],
  today = dayIso(new Date()),
): string {
  const iso = parseHourDayIso(today) ?? String(today ?? "").slice(0, 10);
  const [y, m, d] = iso.split("-").map(Number);
  const start =
    Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)
      ? new Date(y, m - 1, d, 12, 0, 0)
      : new Date();
  for (let i = 1; i <= 16; i++) {
    const day = addDays(start, i);
    if (kalenderCanExtraClose(hours, day, iso)) return dayIso(day);
  }
  return dayIso(addDays(start, 1));
}

/** Open weekday the Kassa can extra-close from the Kalender day, not weekend/Feiertag. */
export function kalenderCanExtraClose(
  hours: HourRow[],
  day: Date,
  today = dayIso(new Date()),
) {
  if (dayIso(day) < today) return false;
  if (isHoliday(day)) return false;
  if (extraClosedOn(hours, day)) return false;
  if (kalenderChipClosedLabel(hours, day)) return false;
  if (!extraClosedRoom(hours, today)) return false;
  return true;
}

export const KALENDER_HOLIDAY_EMPTY_COPY =
  "Feiertag · Ordination zu. Walk-in legt den nächsten Werktag.";
export const KALENDER_HOLIDAY_EMPTY_COPY_ANZEIGE = "Feiertag · Ordination zu.";
export const KALENDER_EMPTY_COPY =
  "Kein Termin an diesem Tag. Silvia oder die Tierarzthelferin legen einen Slot.";
export const KALENDER_EMPTY_COPY_ANZEIGE =
  "Kein Termin an diesem Tag. Einträge erscheinen hier, sobald sie auf dem Schreib-Rechner liegen.";

/** Empty Kalender copy: Feiertag, extra closed hinterlegt, weekend zu, or no slots. Anzeige: never Walk-in / Slot legen. */
export function kalenderClosedEmptyCopy(
  hours: HourRow[],
  day: Date,
  anzeige?: boolean,
) {
  if (isHoliday(day)) {
    return anzeige
      ? KALENDER_HOLIDAY_EMPTY_COPY_ANZEIGE
      : KALENDER_HOLIDAY_EMPTY_COPY;
  }
  if (extraClosedOn(hours, day))
    return `${formatHourDayAt(dayIso(day))} geschlossen hinterlegt.`;
  if (kalenderChipClosedLabel(hours, day) === "zu")
    return "An diesem Tag ist geschlossen.";
  return anzeige ? KALENDER_EMPTY_COPY_ANZEIGE : KALENDER_EMPTY_COPY;
}

/** Extra closed calendar days, unique, sorted. Weekday rows stay out. */
export function extraClosedDays(hours: HourRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of hours) {
    if (!isClosedTime(row.time)) continue;
    const iso = parseHourDayIso(row.day);
    if (!iso || seen.has(iso)) continue;
    seen.add(iso);
    out.push(iso);
  }
  return out.sort();
}

/** Append one extra closed date. Does not change weekday rows (Donnerstag stays open next week). */
export function upsertExtraClosedDay(
  hours: HourRow[],
  rawDay: string,
  today = dayIso(new Date()),
): { ok: true; hours: HourRow[] } | { ok: false; error: string } {
  const iso = parseHourDayIso(rawDay);
  if (!iso) return { ok: false, error: EXTRA_CLOSED_DAY_ERROR };
  if (iso < today) return { ok: false, error: EXTRA_CLOSED_PAST_ERROR };
  const pruned = prunePastExtraClosed(hours, today);
  if (
    pruned.some(
      (row) => parseHourDayIso(row.day) === iso && isClosedTime(row.time),
    )
  ) {
    return { ok: false, error: EXTRA_CLOSED_ALREADY };
  }
  if (pruned.length >= MAX_HOUR_ROWS)
    return { ok: false, error: EXTRA_CLOSED_FULL_ERROR };
  return {
    ok: true,
    hours: [...pruned, { day: iso, time: SIGNUP_CLOSED_TIME }],
  };
}

/** Drop one extra closed date. Does not change weekday rows (Donnerstag stays). */
export function removeExtraClosedDay(
  hours: HourRow[],
  rawDay: string,
): { ok: true; hours: HourRow[] } | { ok: false; error: string } {
  const iso = parseHourDayIso(rawDay);
  if (!iso) return { ok: false, error: EXTRA_CLOSED_DAY_ERROR };
  const next = hours.filter(
    (row) => !(parseHourDayIso(row.day) === iso && isClosedTime(row.time)),
  );
  if (next.length === hours.length)
    return { ok: false, error: EXTRA_CLOSED_MISSING };
  return { ok: true, hours: next };
}

export type ParsedHourWindows = DayWindow[] & { extraClosed: Set<string> };

/** Parse rows like `{ day: "Montag", time: "8:00–12:00, 14:00–18:00" }`. Date rows go to extraClosed. */
export function parseHourWindows(hours: HourRow[]): ParsedHourWindows {
  const windows = [] as unknown as ParsedHourWindows;
  windows.extraClosed = new Set();
  for (const row of hours) {
    const iso = parseHourDayIso(row.day);
    if (iso) {
      if (isClosedTime(row.time)) windows.extraClosed.add(iso);
      continue;
    }
    const key = (row.day.toLowerCase().split(/[\s,/]/)[0] ?? "").trim();
    const day = WEEKDAY[key];
    if (day == null) continue;
    if (isClosedTime(row.time)) continue;
    // Punkt 18: streng validieren statt roh zu rechnen.
    for (const w of parseTimeWindows(row.time)) {
      windows.push({ day, startMin: w.startMin, endMin: w.endMin });
    }
  }
  return windows;
}

function minutesOf(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

/** Eine Uhrzeit als Minuten seit Mitternacht, oder `null` bei ungueltiger Angabe. */
export function clockMinutes(hour: string, minute: string): number | null {
  const h = Number(hour);
  const m = Number(minute);
  // Punkt 18: eigene Bereichspruefung. Vorher rechnete der Parser nur
  // `Number(...) * 60 + Number(...)`: „25:00“ wurde zu 1500 Minuten und
  // „8:70“ zu 550 — beides entstand als Zeitfenster, obwohl es keine Uhrzeit
  // ist.
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23) return null;
  if (m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** Alle gueltigen Zeitfenster einer Zeile wie „8:00–12:00, 14:00–18:00“. */
export function parseTimeWindows(raw: string): Array<{ startMin: number; endMin: number }> {
  const windows: Array<{ startMin: number; endMin: number }> = [];
  for (const part of String(raw ?? "").split(/[,;]/)) {
    const m = part.match(
      /(\d{1,2})[:.](\d{2})\s*(?:[-–—−]|bis)\s*(\d{1,2})[:.](\d{2})/i,
    );
    if (!m) continue;
    const startMin = clockMinutes(m[1]!, m[2]!);
    const endMin = clockMinutes(m[3]!, m[4]!);
    if (startMin === null || endMin === null) continue;
    // Ein Fenster ohne Dauer ist keines.
    if (endMin > startMin) windows.push({ startMin, endMin });
  }
  return windows;
}

export function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Hinterlegte Zeile für diesen Wochentag, z. B. Mittwoch → "8:00–12:00". */
export function hoursRowForDay(
  hours: HourRow[],
  day: Date,
): HourRow | undefined {
  const n = day.getDay();
  return hours.find((row) => {
    const key = (row.day.toLowerCase().split(/[\s,/]/)[0] ?? "").trim();
    return WEEKDAY[key] === n;
  });
}

/** Short desk label: the time string, or "geschlossen" / "keine Zeiten hinterlegt". */
export function hoursLabelForDay(hours: HourRow[], day: Date): string {
  if (isHoliday(day)) return "Feiertag · geschlossen";
  if (extraClosedOn(hours, day)) return "geschlossen";
  const row = hoursRowForDay(hours, day);
  if (!row) return "keine Zeiten hinterlegt";
  const time = row.time.trim();
  if (!time) return "keine Zeiten hinterlegt";
  if (!/\d/.test(time) && /geschlossen|nachtdienst|^zu$/i.test(time))
    return "geschlossen";
  return time;
}

/** Extra-closed, weekend, Feiertag — Walk-in Eintragen should take the next open weekday. */
export function dayIsWalkInClosed(hours: HourRow[], day: Date): boolean {
  if (!hours.length) return false;
  return /geschlossen|Feiertag/i.test(hoursLabelForDay(hours, day));
}

export type OccupiedAppointment = {
  start_at: string;
  minutes?: number;
  status?: string;
  pet?: string;
  owner?: string;
  owner_name?: string;
  phone?: string;
  owner_phone?: string;
};

export function occupiedFromAppointments(
  rows: OccupiedAppointment[],
): OccupiedSlot[] {
  return rows
    .filter((a) => a.status !== "abgesagt" && !isLeftoverNamelessHeuteSlot(a))
    .map((a) => ({
      start: new Date(a.start_at),
      minutes: Number(a.minutes) || 20,
      pet: a.pet,
    }))
    .filter((a) => !Number.isNaN(+a.start));
}

export function parseHoursJson(
  raw: string | null | undefined,
  fallback: HourRow[],
): HourRow[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
    return parsed
      .slice(0, MAX_HOUR_ROWS)
      .map((row) => ({
        day: String((row as HourRow)?.day ?? "").slice(0, 24),
        time: String((row as HourRow)?.time ?? "").slice(0, 80),
      }))
      .filter((row) => row.day);
  } catch {
    return fallback;
  }
}

/**
 * Punkt 19 — Wiener WANDUHR.
 *
 * Liefert ein `Date`, dessen LOKALE Felder die Wiener Wanduhr zeigen
 * (Jahr/Monat/Tag/Stunde/Minute) und dessen Wochentag stimmt. Genau das
 * brauchen die Wochenlogik („ist heute Mittwoch?“), Öffnungszeiten-Fenster und
 * Anzeigen.
 *
 * ACHTUNG: `getTime()` dieses Werts ist NICHT der echte Wiener Zeitpunkt. Auf
 * einem Server mit anderer Zeitzone weicht er um den Versatz ab
 * (`new Date(2026, 8, 17, 9, 0)` in UTC ist 11:00 in Wien, nicht 09:00).
 *
 * Für Vergleiche mit Zeitstempeln des Anschlusses — die echte Zeitpunkte sind —
 * gehört deshalb `viennaInstant()` hierher, nicht dieser Wert.
 */
export function viennaNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const d = new Date(
    Number(g("year")),
    Number(g("month")) - 1,
    Number(g("day")),
    Number(g("hour")),
    Number(g("minute")),
  );
  return d;
}

/**
 * Punkt 19 — Wiener ZEITPUNKT.
 *
 * Der echte Augenblick, mit dem Zeitstempel des Anschlusses verglichen werden
 * duerfen. Anders als `viennaNow()` traegt dieser Wert keinen verschobenen
 * `getTime()`.
 *
 * Eigene Funktion, damit die Absicht an jeder Aufrufstelle sichtbar ist und
 * Tests den Wert ersetzen koennen.
 */
export function viennaInstant(now: Date = new Date()): Date {
  return new Date(now.getTime());
}

function stamp(d: Date) {
  return `${d.getMonth() + 1}-${d.getDate()}`;
}

const CLOSED = new Set([
  "1-1",
  "1-6",
  "5-1",
  "8-15",
  "10-26",
  "11-1",
  "12-8",
  "12-25",
  "12-26",
]);

/** Gregorian computus — Ostersonntag (noon, calendar day). */
export function easterSunday(year: number) {
  const y = Number(year);
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day, 12, 0, 0);
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function addDays(d: Date, n: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

/** Ostermontag, Christi Himmelfahrt, Pfingstmontag, Fronleichnam. Karfreitag nicht. */
export function isMovableHoliday(d: Date) {
  const easter = easterSunday(d.getFullYear());
  const key = ymd(d);
  return [1, 39, 50, 60].some((n) => ymd(addDays(easter, n)) === key);
}

export function isHoliday(d: Date) {
  if (stamp(d) === "12-24" && d.getHours() >= 12) return true;
  if (CLOSED.has(stamp(d))) return true;
  return isMovableHoliday(d);
}

export function isMittagssperre(d: Date) {
  const day = d.getDay();
  if (day === 0 || day === 6 || day === 3) return false;
  const h = d.getHours();
  return h >= 12 && h < 14;
}

export function isOpenHour(d: Date) {
  if (isHoliday(d)) return false;
  const day = d.getDay();
  const h = d.getHours();
  const m = d.getMinutes();
  const t = h * 60 + m;
  if (day === 0) return false;
  if (day === 6) return t >= 9 * 60 && t < 12 * 60;
  if (day === 3) return t >= 8 * 60 && t < 12 * 60;
  if (isMittagssperre(d)) return false;
  const morning = t >= 8 * 60 && t < 12 * 60;
  const afternoon = t >= 14 * 60 && t < (day === 5 ? 17 * 60 : 18 * 60);
  return morning || afternoon;
}

export function deskStatus(d = viennaNow()) {
  if (isHoliday(d)) {
    return {
      code: "feiertag" as const,
      label: "Feiertag · Ordination zu",
      detail: "Silvia nimmt ab und zeigt bei Notfällen den hinterlegten Nachtdienstkontakt.",
    };
  }
  if (d.getDay() === 0) {
    return {
      code: "sonntag" as const,
      label: "Sonntag · Nachtdienst",
      detail:
        "Silvia triagiert und verbindet zur Vetmeduni, statt einer Mobilbox.",
    };
  }
  if (isMittagssperre(d)) {
    return {
      code: "mittag" as const,
      label: "12:00–14:00 geschlossen",
      detail:
        "Geöffnet von 8:00–12:00 und 14:00–18:00. Silvia nimmt trotzdem ab und legt nach 14:00.",
    };
  }
  if (isOpenHour(d)) {
    return {
      code: "offen" as const,
      label: "Ordination offen",
      detail: "Silvia nimmt parallel ab, während die Leitung voll ist.",
    };
  }
  return {
    code: "zu" as const,
    label: "Außerhalb der Zeiten",
    detail: "Silvia merkt Termine vor und zeigt bei Notfällen den hinterlegten Nachtdienstkontakt.",
  };
}

export const SLOT_MINUTES = 20;

export function slotsOverlap(a: Date, aMin: number, b: Date, bMin: number) {
  return (
    a.getTime() < b.getTime() + bMin * 60_000 &&
    b.getTime() < a.getTime() + aMin * 60_000
  );
}

export function occupyingSlot(
  start: Date,
  minutes: number,
  occupied: OccupiedSlot[],
) {
  return (
    occupied.find((slot) =>
      slotsOverlap(start, minutes, slot.start, slot.minutes),
    ) ?? null
  );
}

export function nextOpenSlot(from = viennaNow()) {
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  for (let i = 0; i < 20 * 48; i++) {
    if (isOpenHour(d)) return new Date(d);
    d.setMinutes(d.getMinutes() + 30);
  }
  return d;
}

export function formatSlot(d: Date) {
  const days = [
    "Sonntag",
    "Montag",
    "Dienstag",
    "Mittwoch",
    "Donnerstag",
    "Freitag",
    "Samstag",
  ];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${days[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}. um ${hh}:${mm}`;
}

export function isOpenHourAt(d: Date, windows: DayWindow[]): boolean {
  if (isHoliday(d)) return false;
  const extra = (windows as ParsedHourWindows).extraClosed;
  if (extra?.has(dayIso(d))) return false;
  if (windows.length === 0) return false;
  const t = minutesOf(d);
  return windows.some(
    (w) => w.day === d.getDay() && t >= w.startMin && t < w.endMin,
  );
}

/**
 * Punkt 15 — liegt der GANZE Termin in den Oeffnungszeiten?
 *
 * `isOpenHourAt` prueft nur den Beginn. Bei einem Termin um 11:50 in einem
 * Fenster bis 12:00 galt das als frei, obwohl er bis 12:10 laufen wuerde.
 *
 * Der Termin muss vollstaendig in EINEM Fenster liegen; ein Fenster darf nicht
 * ueberschritten werden, auch wenn gleich darauf das naechste oeffnet.
 */
export function isOpenRangeAt(d: Date, minutes: number, windows: DayWindow[]): boolean {
  if (!isOpenHourAt(d, windows)) return false;
  const start = minutesOf(d);
  const end = start + Math.max(0, minutes);
  // Kein Ueberlauf in den naechsten Tag.
  if (end > 24 * 60) return false;
  const extra = (windows as ParsedHourWindows).extraClosed;
  if (extra?.has(dayIso(d))) return false;
  return windows.some((w) => w.day === d.getDay() && start >= w.startMin && end <= w.endMin);
}

export function deskStatusAt(
  windows: DayWindow[],
  d = viennaNow(),
  isDemo = false,
) {
  const nightLive =
    "Die Tierarzthelferin ruft den hinterlegten Nachtdienst. Silvia verbindet nicht selbst.";
  if (isHoliday(d)) {
    return {
      code: "feiertag" as const,
      label: "Feiertag · Ordination zu",
      detail: isDemo
        ? "Silvia nimmt ab und zeigt bei Notfällen den hinterlegten Nachtdienstkontakt."
        : `Silvia nimmt ab. ${nightLive}`,
    };
  }
  const extra = (windows as ParsedHourWindows).extraClosed;
  if (extra?.has(dayIso(d))) {
    return {
      code: "zu" as const,
      label: "Heute geschlossen hinterlegt",
      detail:
        "Silvia legt keinen Slot. Der Wochentag in den Einstellungen bleibt für nächste Woche.",
    };
  }
  if (windows.length === 0) {
    return {
      code: "zu" as const,
      label: "Keine hinterlegten Zeiten",
      detail:
        "In den Einstellungen Fenster eintragen. Silvia legt keinen Slot ins Leere.",
    };
  }
  if (isOpenHourAt(d, windows)) {
    return {
      code: "offen" as const,
      label: "Ordination offen",
      detail: "Silvia nimmt parallel ab, während die Leitung voll ist.",
    };
  }
  const today = windows
    .filter((w) => w.day === d.getDay())
    .sort((a, b) => a.startMin - b.startMin);
  const t = minutesOf(d);
  for (let i = 0; i < today.length - 1; i++) {
    if (t >= today[i].endMin && t < today[i + 1].startMin) {
      const a = formatMinutes(today[i].endMin);
      const b = formatMinutes(today[i + 1].startMin);
      return {
        code: "mittag" as const,
        label: `${a}–${b} geschlossen`,
        detail: `Geöffnet davor und danach. Silvia nimmt trotzdem ab und legt nach ${b}.`,
      };
    }
  }
  if (today.length === 0) {
    return {
      code: d.getDay() === 0 ? ("sonntag" as const) : ("zu" as const),
      label:
        d.getDay() === 0 ? "Sonntag · Nachtdienst" : "Außerhalb der Zeiten",
      detail: isDemo
        ? "Silvia triagiert und verbindet den hinterlegten Nachtdienst."
        : `Silvia triagiert. ${nightLive}`,
    };
  }
  return {
    code: "zu" as const,
    label: "Außerhalb der Zeiten",
    detail: isDemo
      ? "Silvia merkt Termine vor und zeigt bei Notfällen den hinterlegten Nachtdienstkontakt."
      : `Silvia legt den nächsten Slot. ${nightLive}`,
  };
}

export function nextOpenSlotAt(windows: DayWindow[], from = viennaNow()) {
  return nextFreeSlotAt(windows, [], from);
}

/**
 * Tag/Uhrzeit fuer ein Walk-in-Feld.
 *
 * Punkt 16: `nextFreeSlotAt` liefert jetzt `null`, wenn nichts frei ist. Ein
 * Eingabefeld braucht trotzdem einen Wert — dann bleibt es beim Ausgangspunkt,
 * sichtbar als derselbe Tag und dieselbe Uhrzeit.
 */
export function walkInSeedSlot(
  hours: HourRow[],
  appointments: OccupiedAppointment[] = [],
  from = viennaNow(),
) {
  if (!hours.length) {
    return { start: new Date(from), time: "15:00" };
  }
  const windows = parseHourWindows(hours);
  if (!windows.length) {
    return { start: new Date(from), time: formatMinutes(minutesOf(from)) };
  }
  const slot = nextFreeSlotAt(
    windows,
    occupiedFromAppointments(appointments),
    from,
  );
  // Kein freier Termin: der Ausgangspunkt bleibt stehen (Formularwert).
  const start = slot ?? new Date(from);
  return { start, time: formatMinutes(minutesOf(start)) };
}

/**
 * Walk-in seed for a selected Kalender/Heute day.
 * Future chips start at midnight of that day (first hinterlegte slot), not "now".
 * Today or a past chip still starts from now so morning slots do not reopen.
 * Extra-closed / weekend / Feiertag lands on the next open weekday.
 */
export function walkInFromDay(
  hours: HourRow[],
  appointments: OccupiedAppointment[] = [],
  day: Date,
  now = viennaNow(),
) {
  const selected = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    0,
    0,
    0,
  );
  const from = dayIso(selected) <= dayIso(now) ? now : selected;
  return walkInSeedSlot(hours, appointments, from);
}

/** Extra-closed / weekend / Feiertag → next hinterlegte weekday. Open days keep the typed time. */
export function retargetClosedDayStart(
  hours: HourRow[],
  appointments: OccupiedAppointment[] = [],
  start: Date,
  now = viennaNow(),
) {
  if (!dayIsWalkInClosed(hours, start)) return start;
  return walkInFromDay(hours, appointments, start, now).start;
}

/**
 * Suchraster in Minuten.
 *
 * Punkt 17: Vorher wurde in 30-Minuten-Schritten gesucht, waehrend die
 * Standardtermine 20 Minuten dauern. Eine Luecke von 8:20 bis 8:40 wurde damit
 * uebersprungen, weil nach 8:00 gleich 8:30 geprueft wurde. Das feinere Raster
 * findet sie.
 */
export const SLOT_SEARCH_STEP_MINUTES = 5;

/** So viele Tage im Voraus wird ohne gewuenschtes Datum gesucht. */
const SLOT_SEARCH_DAYS = 20;

/**
 * Punkt 16 — naechster freier Slot, oder `null`.
 *
 * Vorher gab die Funktion IMMER ein Datum zurueck: nach ausgeschoepfter Suche
 * das Ende des Suchlaufs, und ohne hinterlegte Fenster sogar direkt den
 * Ausgangszeitpunkt. Ein nicht vorhandener Termin sah damit wie ein konkreter
 * Vorschlag aus — „jetzt“ statt „kein Termin“.
 *
 * Punkt 15: Der Termin muss mit seiner VOLLEN Dauer in die Oeffnungszeiten
 * passen.
 */
export function nextFreeSlotAt(
  windows: DayWindow[],
  occupied: OccupiedSlot[] = [],
  from = viennaNow(),
  minutes = SLOT_MINUTES,
): Date | null {
  if (!windows.length) return null;
  const d = new Date(from);
  d.setSeconds(0, 0);
  // Auf das Suchraster aufrunden.
  const step = SLOT_SEARCH_STEP_MINUTES;
  d.setMinutes(Math.ceil(d.getMinutes() / step) * step);
  const iterations = Math.ceil((SLOT_SEARCH_DAYS * 24 * 60) / step);
  for (let i = 0; i < iterations; i++) {
    if (isOpenRangeAt(d, minutes, windows) && !occupyingSlot(d, minutes, occupied)) {
      return new Date(d);
    }
    d.setMinutes(d.getMinutes() + step);
  }
  return null;
}

/** Walk-in outside hinterlegte Fenster: error copy plus the next open slot. */
export function walkInClosed(start: Date, windows: DayWindow[]) {
  return walkInBlocked(start, windows, []);
}

/**
 * Walk-in geschlossen oder kollidierend mit einem gelegten Slot.
 *
 * Punkt 16: „Naechster Slot“ kann jetzt fehlen. Dann sagt der Text das
 * ausdruecklich, statt eine erfundene Uhrzeit zu nennen.
 */
export function walkInBlocked(
  start: Date,
  windows: DayWindow[],
  occupied: OccupiedSlot[] = [],
) {
  if (windows.length === 0) {
    return {
      next: start,
      error:
        "Keine hinterlegten Öffnungszeiten. In den Einstellungen die Fenster eintragen.",
    };
  }
  const extra = (windows as ParsedHourWindows).extraClosed;
  const extraToday = extra?.has(dayIso(start));
  const closed =
    isHoliday(start) || extraToday || !isOpenHourAt(start, windows);
  const hit = occupyingSlot(start, SLOT_MINUTES, occupied);
  if (!closed && !hit) return null;
  const slot = nextFreeSlotAt(windows, occupied, start);
  const next = slot ?? start;
  // Kein freier Termin im Suchfenster: ehrlich benennen.
  const tail = slot
    ? `Nächster Slot: ${formatSlot(slot)}.`
    : "In den nächsten Tagen ist kein freier Slot hinterlegt.";
  if (closed) {
    const why = isHoliday(start)
      ? "Heute ist Feiertag"
      : extraToday
        ? "Heute ist geschlossen hinterlegt"
        : "Zu dieser Zeit ist geschlossen";
    return {
      next,
      error: `${why}. ${tail}`,
    };
  }
  const who = hit?.pet ? ` (${hit.pet})` : "";
  return {
    next,
    error: `Der Slot ist belegt${who}. ${tail}`,
  };
}

/** Kalender chip: Feiertag, geschlossen, or empty so the gelegt-count can show. */
export function kalenderChipClosedLabel(hours: HourRow[], day: Date) {
  if (isHoliday(day)) return "Feiertag";
  const label = hoursLabelForDay(hours, day);
  if (label === "geschlossen" || label === "keine Zeiten hinterlegt")
    return "zu";
  return "";
}
