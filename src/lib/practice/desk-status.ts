import { sanitizeHalterinEmail } from "../alma/phone.ts";

export const APPOINTMENT_STATUSES = ["gelegt", "bestätigt", "abgesagt"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const CALL_DESK_STATUSES = ["offen", "erledigt", "notfall"] as const;
export type CallDeskStatus = (typeof CALL_DESK_STATUSES)[number];

export const EMERGENCY_STATUSES = ["verbunden", "übernommen", "abgeschlossen"] as const;
export type EmergencyStatus = (typeof EMERGENCY_STATUSES)[number];

export function sanitizeAppointmentStatus(raw: string): AppointmentStatus | null {
  return (APPOINTMENT_STATUSES as readonly string[]).includes(raw) ? (raw as AppointmentStatus) : null;
}

export function sanitizeCallStatus(raw: string): CallDeskStatus | null {
  return (CALL_DESK_STATUSES as readonly string[]).includes(raw) ? (raw as CallDeskStatus) : null;
}

export function sanitizeEmergencyStatus(raw: string): EmergencyStatus | null {
  return (EMERGENCY_STATUSES as readonly string[]).includes(raw) ? (raw as EmergencyStatus) : null;
}

/** Heute / Notfall badge: stored `verbunden` is "on the board", not a PSTN connect. */
export function emergencyStatusLabel(status: string) {
  if (status === "verbunden") return "auf der Tafel";
  return status;
}

export function parseWalkIn(input: {
  pet?: string;
  owner?: string;
  kind?: string;
  start?: string;
  phone?: string;
  email?: string;
}) {
  const pet = String(input?.pet ?? "").trim().slice(0, 40);
  const owner = String(input?.owner ?? "").trim().slice(0, 80);
  const kind = String(input?.kind ?? "").trim().slice(0, 60) || "Kontrolle";
  const phone = String(input?.phone ?? "").replace(/\s/g, "").slice(0, 24);
  const email = sanitizeHalterinEmail(input?.email);
  const start = new Date(String(input?.start ?? ""));
  if (pet.length < 2 || owner.length < 2 || Number.isNaN(+start)) return null;
  return { pet, owner, kind, phone, email, start };
}

export function parseRescheduleStart(raw: string) {
  const start = new Date(String(raw ?? ""));
  if (Number.isNaN(+start)) return null;
  return start;
}

/** Build a walk-in Date from the native date/time field values, not stale React state. */
export function walkInStartFromFields(dayIso: string, time: string) {
  const day = String(dayIso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [h, m] = String(time || "15:00").split(":").map(Number);
  const start = new Date(`${day}T12:00:00`);
  if (Number.isNaN(+start)) return null;
  start.setHours(Number.isFinite(h) ? h : 15, Number.isFinite(m) ? m : 0, 0, 0);
  return start;
}

export type WalkInFieldIds = {
  owner: string;
  phone: string;
  email?: string;
  pet: string;
  kind: string;
  time: string;
  date?: string;
  dateAnzeige?: string;
  timeAnzeige?: string;
};

/** Neutral Walk-in hints — not Huber names, so an empty field does not look filled. */
export const WALK_IN_PLACEHOLDERS = {
  owner: "Name",
  phone: "0664 … oder 0316 …",
  email: "name@…",
  pet: "Name des Tiers",
} as const;

/** Live Tafel search — not Momo/Nowak/Nala/Huber, so Suche does not look like Demo-Klientel. */
export const DESK_SEARCH_PLACEHOLDER = "Name, name@…, 0664…";
export const DESK_SEARCH_PLACEHOLDER_AKTE = "Name, name@…, Chip…";
export const AKTE_EMAIL_PLACEHOLDER = "name@… — für Bestätigungs-Mail";

/** Walk-in and Akte: Festnetz is a valid SMS number, not a missing Handy. */
export const HALTERIN_PHONE_LABEL = "Telefon der Halterin";
export const HALTERIN_PHONE_HINT = "Handy für WhatsApp, Festnetz für SMS.";

/** Same IDs as WalkInForm. Heute uses `heute-`, Kalender uses `kalender-`. */
export function walkInFieldIds(prefix: string) {
  const p = String(prefix ?? "");
  return {
    owner: `${p}owner`,
    phone: `${p}owner-phone`,
    email: `${p}owner-email`,
    pet: `${p}pet`,
    kind: `${p}kind`,
    time: `${p}time`,
    date: `${p}date`,
    eintragen: `${p}eintragen`,
    dateAnzeige: `${p}date-anzeige`,
    timeAnzeige: `${p}time-anzeige`,
  };
}

/** Same IDs as RescheduleForm. Date/time stay hidden until the Kassa opens Umlegen. */
export function umlegenFieldIds(id: string) {
  const p = String(id ?? "").slice(0, 80);
  return {
    open: `umlegen-open-${p}`,
    date: `umlegen-date-${p}`,
    time: `umlegen-time-${p}`,
    dateAnzeige: `umlegen-date-anzeige-${p}`,
    timeAnzeige: `umlegen-time-anzeige-${p}`,
    save: `umlegen-save-${p}`,
    cancel: `umlegen-abbrechen-${p}`,
    drafts: `umlegen-drafts-${p}`,
    wa: `umlegen-wa-${p}`,
    sms: `umlegen-sms-${p}`,
    mail: `umlegen-mail-${p}`,
  };
}

/** Same IDs as WalkInForm. Reads Halterin, Handy, E-Mail, Tier, Anliegen, Tag and Uhrzeit from the DOM. */
export function walkInFromFields(
  get: (id: string) => string,
  ids: WalkInFieldIds,
  fallbackDayIso: string,
) {
  const owner = get(ids.owner).trim().slice(0, 80);
  const pet = get(ids.pet).trim().slice(0, 40);
  const kind = get(ids.kind).trim().slice(0, 60) || "Kontrolle";
  const phone = get(ids.phone);
  const email = ids.email ? sanitizeHalterinEmail(get(ids.email)) : "";
  const time = get(ids.time) || "15:00";
  const date = (ids.date ? get(ids.date) : "").trim().slice(0, 10) || fallbackDayIso;
  return {
    owner,
    pet,
    kind,
    phone,
    email,
    time,
    date,
    start: walkInStartFromFields(date, time),
  };
}
