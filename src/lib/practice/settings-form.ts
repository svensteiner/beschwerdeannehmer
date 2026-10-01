import { keepBundesland, keepCity, keepLocationHint, keepNachtdienstName, keepNachtdienstNote, keepNotes, keepOwnerName, keepPracticeName, keepStreet, keepZip, OWNER_NAME_EMPTY_ERROR, PARKPLATZ_HINT_EMPTY_ERROR, PRACTICE_NAME_EMPTY_ERROR, parsePracticeAnreise, parsePracticeOrt } from "../alma/desk.ts";
import { parseKeptInbox, parseKeptNachtdienstPhone, parseKeptPhone, parseKeptWhatsapp } from "../alma/phone.ts";
import { dayIso, MAX_HOUR_ROWS, nextExtraClosedSeed, parseHourDayIso, SIGNUP_CLOSED_TIME, type HourRow } from "../alma/hours.ts";

export type SettingsSnapshot = {
  name: string;
  ownerName: string;
  street: string;
  zip: string;
  city: string;
  bundesland: string;
  phone: string;
  whatsapp: string;
  email: string;
  pms: string;
  locationHint: string;
  nachtdienstName: string;
  nachtdienstPhone: string;
  nachtdienstNote: string;
  notes: string;
  retentionDays: string;
  hours: HourRow[];
  vets: string;
  resources: string;
  behavior: string;
  consentEnabled: boolean;
  consentNote: string;
};

/** Löschroutine: Anrufe/Protokolle älter als N Tage. Default 90, 7–3650 Tage. */
export const RETENTION_DAYS_DEFAULT = 90;
export const RETENTION_DAYS_MIN = 7;
export const RETENTION_DAYS_MAX = 3650;
export const RETENTION_DAYS_ERROR = `Aufbewahrung muss zwischen ${RETENTION_DAYS_MIN} und ${RETENTION_DAYS_MAX} Tagen liegen.`;

/** Empty field keeps the hinterlegte Zahl (register default 90), never a silent 0. */
export function parseRetentionDays(
  incoming?: string | number | null,
  current?: number | null,
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = String(incoming ?? "").trim();
  const raw = trimmed === "" ? (current ?? RETENTION_DAYS_DEFAULT) : trimmed;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < RETENTION_DAYS_MIN || n > RETENTION_DAYS_MAX) {
    return { ok: false, error: RETENTION_DAYS_ERROR };
  }
  return { ok: true, value: n };
}

/** Same IDs as /app/einstellungen. Reads the fields, not stale React state. */
export const SETTINGS_FIELD_IDS = [
  "name",
  "ownerName",
  "street",
  "zip",
  "city",
  "bundesland",
  "phone",
  "whatsapp",
  "email",
  "pms",
  "locationHint",
  "nachtdienstName",
  "nachtdienstPhone",
  "nachtdienstNote",
  "notes",
  "retentionDays",
  "vets",
  "resources",
  "behavior",
  "consentNote",
] as const;

export { MAX_HOUR_ROWS };

export function hourDayId(index: number) {
  return `hour-day-${index}`;
}

/** Display-only German date under ISO extra-closed pickers (`27.8.2026`). */
export function hourDayAnzeigeId(index: number) {
  return `hour-day-anzeige-${index}`;
}

export const HOUR_EXTRA_CLOSED_ID = "hour-extra-closed";

/** Extra geschlossen chip: next open weekday, not today. Today stays pickable on the date field. */
export function extraClosedDraftRow(hours: HourRow[], today = dayIso(new Date())): HourRow {
  return { day: nextExtraClosedSeed(hours, today), time: SIGNUP_CLOSED_TIME };
}

/** ISO extra-closed rows get a date picker; weekdays stay text (Montag). */
export function hourDayInputType(day: string): "date" | "text" {
  const t = day.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && parseHourDayIso(t) ? "date" : "text";
}

export function hourTimeId(index: number) {
  return `hour-time-${index}`;
}

export function hourPresetId(index: number, preset: string) {
  return `hour-preset-${preset}-${index}`;
}

/** One click instead of typing Huber format. Kassa can still edit the field. */
export const HOUR_TIME_PRESETS = [
  { id: "voll", label: "8–12 und 14–18", time: "8:00–12:00, 14:00–18:00" },
  { id: "vormittag", label: "nur vormittags", time: "8:00–12:00" },
  { id: "zu", label: "geschlossen", time: "geschlossen · Nachtdienst" },
] as const;

export type HourTimePresetId = (typeof HOUR_TIME_PRESETS)[number]["id"];

/** Count hour rows from the DOM so Speichern does not depend on React length. */
export function hourRowCount(has: (id: string) => boolean, fallback: number) {
  let n = 0;
  while (n < MAX_HOUR_ROWS && has(hourDayId(n))) n += 1;
  return n || fallback;
}

export function settingsFromFields(
  get: (id: string) => string,
  hourCount: number,
  fallbackHours: HourRow[] = [],
  consentEnabled = false,
): SettingsSnapshot {
  const hours: HourRow[] = [];
  for (let i = 0; i < hourCount; i++) {
    const rawDay = get(hourDayId(i)).trim().slice(0, 24);
    const day = parseHourDayIso(rawDay) ?? rawDay;
    const time = get(hourTimeId(i)).trim().slice(0, 80);
    if (!day && !time) continue;
    hours.push({ day, time });
  }
  return {
    name: get("name").trim().slice(0, 80),
    ownerName: get("ownerName").trim().slice(0, 80),
    street: get("street").trim().slice(0, 80),
    zip: get("zip").trim().slice(0, 12),
    city: get("city").trim().slice(0, 60),
    bundesland: get("bundesland").trim().slice(0, 40),
    phone: get("phone").trim().slice(0, 32),
    whatsapp: get("whatsapp").trim().slice(0, 32),
    email: get("email").trim().slice(0, 160),
    pms: get("pms").trim().slice(0, 40),
    locationHint: get("locationHint").trim().slice(0, 400),
    nachtdienstName: get("nachtdienstName").trim().slice(0, 80),
    nachtdienstPhone: get("nachtdienstPhone").trim().slice(0, 32),
    nachtdienstNote: get("nachtdienstNote").trim().slice(0, 240),
    notes: get("notes").trim().slice(0, 400),
    retentionDays: get("retentionDays").trim().slice(0, 8),
    hours: hours.length ? hours : fallbackHours,
    vets: get("vets").trim().slice(0, 4000),
    resources: get("resources").trim().slice(0, 4000),
    behavior: get("behavior").trim().slice(0, 2000),
    consentEnabled,
    consentNote: get("consentNote").trim().slice(0, 200),
  };
}

export type SettingsSaveCurrent = {
  loginEmail: string;
  bundesland: string;
  locationHint: string;
  nachtdienstName: string;
  nachtdienstPhone: string;
  notes: string;
  ownerName: string;
  whatsapp: string;
  nachtdienstNote: string;
  zip: string;
  street: string;
  email: string;
  phone: string;
  city: string;
  name: string;
  retentionDays: number;
};

export type SettingsSaveValue = {
  name: string;
  ownerName: string;
  street: string;
  zip: string;
  city: string;
  bundesland: string;
  phone: string;
  whatsapp: string;
  email: string;
  locationHint: string;
  nachtdienstName: string;
  nachtdienstPhone: string;
  nachtdienstNote: string;
  notes: string;
  retentionDays: number;
};

/** Speichern: same Pflicht as register. Empty Bundesland keeps the hinterlegte Land, never Anmelden as inbox. */
export function parseSettingsProfile(
  data: Pick<
    SettingsSnapshot,
    | "name"
    | "street"
    | "zip"
    | "city"
    | "bundesland"
    | "phone"
    | "whatsapp"
    | "email"
    | "locationHint"
    | "nachtdienstName"
    | "nachtdienstPhone"
    | "nachtdienstNote"
    | "notes"
    | "ownerName"
    | "retentionDays"
  >,
  current: SettingsSaveCurrent,
): { ok: true; value: SettingsSaveValue } | { ok: false; error: string } {
  const name = keepPracticeName(data.name, current.name);
  if (!name) return { ok: false, error: PRACTICE_NAME_EMPTY_ERROR };
  const ownerName = keepOwnerName(data.ownerName, current.ownerName);
  if (!ownerName) return { ok: false, error: OWNER_NAME_EMPTY_ERROR };
  const city = keepCity(data.city, current.city);
  const place = parsePracticeOrt({ city, bundesland: data.bundesland });
  if (!place.ok) return place;
  const street = keepStreet(data.street, current.street);
  const anreise = parsePracticeAnreise({ street, zip: data.zip });
  if (!anreise.ok) return anreise;
  const phone = parseKeptPhone(data.phone, current.phone);
  if (!phone.ok) return phone;
  const inbox = parseKeptInbox(data.email, current.email, current.loginEmail);
  if (!inbox.ok) return inbox;
  const night = parseKeptNachtdienstPhone(data.nachtdienstPhone, current.nachtdienstPhone);
  if (!night.ok) return night;
  const locationHint = keepLocationHint(data.locationHint, current.locationHint);
  if (!locationHint) return { ok: false, error: PARKPLATZ_HINT_EMPTY_ERROR };
  const whatsapp = parseKeptWhatsapp(data.whatsapp, current.whatsapp);
  if (!whatsapp.ok) return whatsapp;
  const retention = parseRetentionDays(data.retentionDays, current.retentionDays);
  if (!retention.ok) return retention;
  return {
    ok: true,
    value: {
      name,
      ownerName,
      street: anreise.street,
      zip: keepZip(anreise.zip, current.zip),
      city: place.city,
      bundesland: keepBundesland(place.bundesland, current.bundesland),
      phone: phone.value,
      whatsapp: whatsapp.value,
      email: inbox.value,
      locationHint,
      nachtdienstName: keepNachtdienstName(data.nachtdienstName, current.nachtdienstName),
      nachtdienstPhone: night.phone,
      nachtdienstNote: keepNachtdienstNote(data.nachtdienstNote, current.nachtdienstNote),
      notes: keepNotes(data.notes, current.notes),
      retentionDays: retention.value,
    },
  };
}
