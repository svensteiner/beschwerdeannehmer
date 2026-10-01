import { isPlaceholderPet } from "../alma/protocol.ts";

/** Heute/Kalender and occupancy look at this window, not the oldest rows. */
export const BOARD_LOOKBACK_DAYS = 1;
export const BOARD_LOOKAHEAD_DAYS = 16;
export const BOARD_APPOINTMENT_LIMIT = 240;
export const BOARD_PATIENT_LIMIT = 80;
export const BOARD_CALL_LIMIT = 80;
export const BOARD_CHIP_DAYS = 14;
export const BOARD_THREAD_LIMIT = 40;
export const BOARD_MAIL_LIMIT = 40;
export const BOARD_EMERGENCY_LIMIT = 40;
export const BOARD_WAITLIST_LIMIT = 40;

export function boardRange(from = new Date()) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - BOARD_LOOKBACK_DAYS);
  const end = new Date(from);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + BOARD_LOOKAHEAD_DAYS);
  return { start, end };
}

function localDayStart(from: Date) {
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** True when the slot is today or later (server-local midnight). */
export function isUpcomingSlot(startAt: string | Date, from = new Date()) {
  const start = startAt instanceof Date ? startAt : new Date(startAt);
  if (Number.isNaN(+start)) return false;
  return start >= localDayStart(from);
}

/** True when the slot falls on the same local calendar day as `from`. */
export function isSameLocalDay(startAt: string | Date, from = new Date()) {
  const start = startAt instanceof Date ? startAt : new Date(startAt);
  if (Number.isNaN(+start)) return false;
  const day = localDayStart(from);
  const next = new Date(day);
  next.setDate(next.getDate() + 1);
  return start >= day && start < next;
}

/** Later-day preview on Heute; the rest lives under "Noch n Termine im Kalender". */
export const HEUTE_LATER_TAKE = 4;
/** Later-day cancelled preview so Wieder einsetzen still works past today. */
export const HEUTE_CANCELLED_TAKE = 2;

export type NextUpcoming<T> = { items: T[]; laterHidden: number };

export type LeftoverNamelessHeuteSlot = {
  pet?: string;
  owner?: string;
  owner_name?: string;
  phone?: string;
  owner_phone?: string;
};

/**
 * Leftover placeholder pet + Klientel/empty + no Handy — hide from Heute,
 * Kalender day list, chip counts, and occupancy (Walk-in may take that slot).
 * Named Halterin nameless books (Frau Holzer / Frau Eder) stay.
 */
export function isLeftoverNamelessHeuteSlot(row: LeftoverNamelessHeuteSlot) {
  const pet = String(row.pet ?? "").trim();
  if (!pet || !isPlaceholderPet(pet)) return false;
  const phone = String(row.owner_phone ?? row.phone ?? "").trim();
  if (phone) return false;
  const owner = String(row.owner_name ?? row.owner ?? "").trim();
  return !owner || owner === "Klientel";
}

/**
 * Heute "Nächste Termine": every laid/bestätigt slot from today, a few later days,
 * all of today's cancelled, plus a few later cancelled so Absagen can be undone.
 */
export function nextUpcomingAppointments<
  T extends LeftoverNamelessHeuteSlot & { start_at: string; status?: string },
>(
  rows: T[],
  from = new Date(),
  laterTake = HEUTE_LATER_TAKE,
  cancelledTake = HEUTE_CANCELLED_TAKE,
): NextUpcoming<T> {
  const upcoming = rows.filter(
    (a) => isUpcomingSlot(a.start_at, from) && !isLeftoverNamelessHeuteSlot(a),
  );
  const byStart = (a: T, b: T) => String(a.start_at).localeCompare(String(b.start_at));
  const active = upcoming.filter((a) => a.status !== "abgesagt").sort(byStart);
  const todayActive = active.filter((a) => isSameLocalDay(a.start_at, from));
  const laterActive = active.filter((a) => !isSameLocalDay(a.start_at, from));
  const laterHidden = Math.max(0, laterActive.length - laterTake);
  const cancelled = upcoming.filter((a) => a.status === "abgesagt").sort(byStart);
  const todayCancelled = cancelled.filter((a) => isSameLocalDay(a.start_at, from));
  const laterCancelled = cancelled
    .filter((a) => !isSameLocalDay(a.start_at, from))
    .slice(0, cancelledTake);
  return {
    items: [...todayActive, ...laterActive.slice(0, laterTake), ...todayCancelled, ...laterCancelled],
    laterHidden,
  };
}

/** Soonest gelegt slot for this pet — Akte WhatsApp-Bestätigung after Handy is saved. */
export function gelegtSlotForPet<T extends { pet: string; status: string; start_at: string }>(
  rows: T[],
  pet: string,
): T | null {
  const name = String(pet ?? "").trim().toLowerCase();
  if (!name || name === "patient") return null;
  const open = rows
    .filter((a) => a.status === "gelegt" && a.pet.toLowerCase() === name)
    .sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)));
  return open[0] ?? null;
}

export function heuteSlotDomId(id: string) {
  return `heute-slot-${String(id ?? "").slice(0, 80)}`;
}

/**
 * Today's gelegt slots — Heute "n noch zu bestätigen" and the jump target.
 * Later days stay in the list but are not this morning's confirm queue.
 */
export function openConfirmToday<
  T extends LeftoverNamelessHeuteSlot & { id: string; start_at: string; status?: string },
>(
  rows: T[],
  from = new Date(),
) {
  const open = rows
    .filter(
      (a) =>
        a.status === "gelegt" &&
        isSameLocalDay(a.start_at, from) &&
        !isLeftoverNamelessHeuteSlot(a),
    )
    .sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)));
  return { count: open.length, first: open[0] ?? null };
}

export function openConfirmLabel(count: number) {
  if (count <= 0) return "";
  return count === 1 ? "1 noch zu bestätigen" : `${count} noch zu bestätigen`;
}
