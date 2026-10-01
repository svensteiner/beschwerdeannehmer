import { isLeftoverNamelessHeuteSlot, type LeftoverNamelessHeuteSlot } from "./board-window.ts";
import { patientPhoneDigits, patientSearchNeedle } from "./patient-query.ts";

export function appointmentSearchNeedle(raw: string) {
  return patientSearchNeedle(raw);
}

/** Same fields the Kassa types into #kalender-q (Tier, Halterin, Anliegen, Handy, E-Mail, Status). */
export function appointmentMatchesNeedle(
  needle: string,
  row: {
    pet: string;
    owner_name: string;
    kind?: string;
    vet?: string;
    status?: string;
    owner_phone?: string;
    owner_email?: string;
    channel?: string;
  },
) {
  if (!needle) return true;
  const blob = [
    row.pet,
    row.owner_name,
    row.kind ?? "",
    row.vet ?? "",
    row.status ?? "",
    row.channel ?? "",
    row.owner_email ?? "",
  ]
    .join(" ")
    .toLowerCase();
  if (blob.includes(needle)) return true;
  const digits = patientPhoneDigits(needle);
  const phone = patientPhoneDigits(row.owner_phone ?? "");
  return digits.length >= 3 && phone.includes(digits);
}

/** Local calendar day (YYYY-MM-DD). Do not use Date#toISOString — Vienna midnight is the previous UTC day. */
export function calendarDayKey(day: string | Date) {
  if (day instanceof Date && !Number.isNaN(+day)) {
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, "0");
    const d = String(day.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(day).slice(0, 10);
}

export function calendarChipId(day: string | Date) {
  return `kalender-tag-${calendarDayKey(day)}`;
}

export function calendarSlotId(id: string) {
  return `kalender-slot-${String(id).slice(0, 80)}`;
}

/** Slots on this local calendar day — leftover nameless Patient+Klientel stay off the list. */
export function appointmentsOnDay<T extends LeftoverNamelessHeuteSlot & { start_at: string }>(
  rows: T[],
  day: Date | string,
) {
  const key = calendarDayKey(day);
  return rows
    .filter((a) => {
      if (isLeftoverNamelessHeuteSlot(a)) return false;
      const start = new Date(a.start_at);
      if (Number.isNaN(+start)) return false;
      return calendarDayKey(start) === key;
    })
    .sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at));
}

/** Gelegt slots on this local calendar day — Kalender chips without a search. */
export function gelegtCountOnDay(
  rows: Array<LeftoverNamelessHeuteSlot & { start_at: string; status?: string }>,
  day: Date | string,
) {
  const key = calendarDayKey(day);
  return rows.filter((a) => {
    if (a.status !== "gelegt") return false;
    if (isLeftoverNamelessHeuteSlot(a)) return false;
    const start = new Date(a.start_at);
    if (Number.isNaN(+start)) return false;
    return calendarDayKey(start) === key;
  }).length;
}

export function kalenderDayFromSearch(raw: unknown) {
  const s = String(raw ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

export function kalenderChipOpenLabel(count: number) {
  if (count <= 0) return "";
  return count === 1 ? "1 noch zu bestätigen" : `${count} noch zu bestätigen`;
}

/** Typed #kalender-q — keep the casing so the field does not jump to lowercase. */
export function kalenderQueryFromSearch(raw: unknown) {
  const q = String(raw ?? "").trim().slice(0, 40);
  return q || undefined;
}

/** Kalender search: ?d= and ?q= survive board poll; omit a to drop a highlighted slot. */
export function kalenderSearch(input: { a?: unknown; d?: unknown; q?: unknown }): {
  a?: string;
  d?: string;
  q?: string;
} {
  const d = kalenderDayFromSearch(input.d);
  const a = typeof input.a === "string" && input.a.trim() ? input.a.trim().slice(0, 80) : undefined;
  const q = kalenderQueryFromSearch(input.q);
  return {
    ...(a ? { a } : {}),
    ...(d ? { d } : {}),
    ...(q ? { q } : {}),
  };
}

export function kalenderDaySearch(day: Date | string, appointmentId?: string, query?: string) {
  return kalenderSearch({ d: calendarDayKey(day), a: appointmentId, q: query });
}

/** Heute "Im Kalender" — slot id plus the local day so poll cannot open today first. */
export function kalenderAppointmentSearch(row: { id: string; start_at: string }) {
  return kalenderDaySearch(row.start_at, row.id);
}

/** Noon local, so DST does not shift the calendar day. */
export function dateFromDayKey(key: string, fallback = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key ?? ""));
  if (!m) {
    const d = new Date(fallback);
    d.setHours(12, 0, 0, 0);
    return d;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}
