import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BOARD_APPOINTMENT_LIMIT,
  BOARD_CALL_LIMIT,
  BOARD_PATIENT_LIMIT,
  BOARD_THREAD_LIMIT,
  BOARD_MAIL_LIMIT,
  BOARD_EMERGENCY_LIMIT,
  BOARD_CHIP_DAYS,
  BOARD_LOOKAHEAD_DAYS,
  BOARD_LOOKBACK_DAYS,
  boardRange,
  HEUTE_CANCELLED_TAKE,
  HEUTE_LATER_TAKE,
  isSameLocalDay,
  isUpcomingSlot,
  gelegtSlotForPet,
  isLeftoverNamelessHeuteSlot,
  nextUpcomingAppointments,
  heuteSlotDomId,
  openConfirmLabel,
  openConfirmToday,
} from "./board-window.ts";

test("board window is yesterday through two weeks ahead, not the oldest rows", () => {
  const from = new Date(2026, 7, 25, 16, 0);
  const { start, end } = boardRange(from);
  assert.equal(start.getDate(), 24);
  assert.equal(start.getHours(), 0);
  assert.equal(end.getDate(), 10);
  assert.equal(end.getMonth(), 8);
  assert.equal(BOARD_LOOKBACK_DAYS, 1);
  assert.equal(BOARD_LOOKAHEAD_DAYS, 16);
  assert.equal(BOARD_APPOINTMENT_LIMIT, 240);
  assert.equal(BOARD_PATIENT_LIMIT, 80);
  assert.equal(BOARD_CALL_LIMIT, 80);
  assert.equal(BOARD_THREAD_LIMIT, 40);
  assert.equal(BOARD_MAIL_LIMIT, 40);
  assert.equal(BOARD_EMERGENCY_LIMIT, 40);
  assert.equal(BOARD_CHIP_DAYS, 14);
  assert.equal(isUpcomingSlot(new Date(2026, 7, 25, 8, 0), from), true);
  assert.equal(isUpcomingSlot(new Date(2026, 7, 24, 15, 0), from), false);
  const old = Array.from({ length: 40 }, (_, i) => ({
    start_at: new Date(2026, 6, 1 + i, 15, 0).toISOString(),
    status: "gelegt",
    pet: `Alt-${i}`,
  }));
  const today = {
    start_at: new Date(2026, 7, 25, 16, 0).toISOString(),
    status: "gelegt",
    pet: "Heute-Nala",
  };
  const shown = nextUpcomingAppointments([...old, today], from);
  assert.equal(shown.items.length, 1);
  assert.equal(shown.items[0]?.pet, "Heute-Nala");
  assert.equal(shown.laterHidden, 0);
});

test("isSameLocalDay matches isUpcomingSlot midnight, not the next calendar day", () => {
  const from = new Date(2026, 7, 25, 9, 0);
  assert.equal(isSameLocalDay(new Date(2026, 7, 25, 0, 0), from), true);
  assert.equal(isSameLocalDay(new Date(2026, 7, 25, 23, 59), from), true);
  assert.equal(isSameLocalDay(new Date(2026, 7, 26, 0, 0), from), false);
  assert.equal(isSameLocalDay(new Date(2026, 7, 24, 15, 0), from), false);
  assert.equal(isSameLocalDay("not-a-date", from), false);
});

test("Heute keeps cancelled upcoming so Absagen can be undone", () => {
  const from = new Date(2026, 7, 25, 9, 0);
  const rows = [
    { start_at: new Date(2026, 7, 24, 15, 0).toISOString(), status: "gelegt", pet: "Gestern" },
    { start_at: new Date(2026, 7, 25, 10, 0).toISOString(), status: "abgesagt", pet: "Aus" },
    { start_at: new Date(2026, 7, 25, 15, 0).toISOString(), status: "gelegt", pet: "Nala" },
    { start_at: new Date(2026, 7, 26, 9, 0).toISOString(), status: "bestätigt", pet: "Poldi" },
  ];
  const next = nextUpcomingAppointments(rows, from);
  assert.deepEqual(
    next.items.map((a) => a.pet),
    ["Nala", "Poldi", "Aus"],
  );
  const onlyCancelled = nextUpcomingAppointments(
    [{ start_at: new Date(2026, 7, 25, 10, 0).toISOString(), status: "abgesagt", pet: "Momo" }],
    from,
  );
  assert.equal(onlyCancelled.items[0]?.pet, "Momo");
});

test("Heute shows every laid slot from today, not a cap of four", () => {
  const from = new Date(2026, 7, 26, 9, 0);
  const today = Array.from({ length: 6 }, (_, i) => ({
    start_at: new Date(2026, 7, 26, 8, i * 20).toISOString(),
    status: i === 5 ? "bestätigt" : "gelegt",
    pet: `Heute-${i + 1}`,
  }));
  const next = nextUpcomingAppointments(today, from);
  assert.deepEqual(
    next.items.map((a) => a.pet),
    ["Heute-1", "Heute-2", "Heute-3", "Heute-4", "Heute-5", "Heute-6"],
  );
  assert.equal(next.laterHidden, 0);
});

test("Heute later-day preview is four; overflow counts the rest for the Kalender link", () => {
  assert.equal(HEUTE_LATER_TAKE, 4);
  assert.equal(HEUTE_CANCELLED_TAKE, 2);
  const from = new Date(2026, 7, 26, 9, 0);
  const later = Array.from({ length: 6 }, (_, i) => ({
    start_at: new Date(2026, 7, 27, 15, i * 20).toISOString(),
    status: "gelegt",
    pet: `Morgen-${i + 1}`,
  }));
  const next = nextUpcomingAppointments(later, from);
  assert.deepEqual(
    next.items.map((a) => a.pet),
    ["Morgen-1", "Morgen-2", "Morgen-3", "Morgen-4"],
  );
  assert.equal(next.laterHidden, 2);
});

test("Heute shows every cancelled slot from today so Wieder einsetzen stays on the Tafel", () => {
  const from = new Date(2026, 7, 26, 9, 0);
  const rows = [
    { start_at: new Date(2026, 7, 26, 8, 0).toISOString(), status: "abgesagt", pet: "Aus-1" },
    { start_at: new Date(2026, 7, 26, 8, 20).toISOString(), status: "abgesagt", pet: "Aus-2" },
    { start_at: new Date(2026, 7, 26, 8, 40).toISOString(), status: "abgesagt", pet: "Aus-3" },
    { start_at: new Date(2026, 7, 27, 9, 0).toISOString(), status: "abgesagt", pet: "Morgen-Aus-1" },
    { start_at: new Date(2026, 7, 27, 9, 20).toISOString(), status: "abgesagt", pet: "Morgen-Aus-2" },
    { start_at: new Date(2026, 7, 27, 9, 40).toISOString(), status: "abgesagt", pet: "Morgen-Aus-3" },
  ];
  const next = nextUpcomingAppointments(rows, from);
  assert.deepEqual(
    next.items.map((a) => a.pet),
    ["Aus-1", "Aus-2", "Aus-3", "Morgen-Aus-1", "Morgen-Aus-2"],
  );
});

test("Akte confirm uses the soonest gelegt slot, not a cancelled or later pet", () => {
  const rows = [
    { id: "old", pet: "Momo", status: "abgesagt", start_at: "2026-08-26T09:00:00" },
    { id: "later", pet: "Momo", status: "gelegt", start_at: "2026-08-27T16:00:00" },
    { id: "soon", pet: "Momo", status: "gelegt", start_at: "2026-08-27T15:00:00" },
    { id: "other", pet: "Nala", status: "gelegt", start_at: "2026-08-27T14:00:00" },
  ];
  assert.equal(gelegtSlotForPet(rows, "Momo")?.id, "soon");
  assert.equal(gelegtSlotForPet(rows, "Patient"), null);
  assert.equal(gelegtSlotForPet(rows, "Zorro"), null);
});

test("Heute hides leftover Patient plus Klientel without Handy, not named Halterin books", () => {
  assert.equal(
    isLeftoverNamelessHeuteSlot({ pet: "Patient", owner_name: "Klientel" }),
    true,
  );
  assert.equal(isLeftoverNamelessHeuteSlot({ pet: "Patient", owner: "" }), true);
  assert.equal(isLeftoverNamelessHeuteSlot({ pet: "Hund", owner_name: "Klientel" }), true);
  assert.equal(
    isLeftoverNamelessHeuteSlot({
      pet: "Patient",
      owner_name: "Klientel",
      owner_phone: "0664 55 70 23",
    }),
    false,
  );
  assert.equal(
    isLeftoverNamelessHeuteSlot({ pet: "Patient", owner_name: "Frau Holzer" }),
    false,
  );
  assert.equal(
    isLeftoverNamelessHeuteSlot({ pet: "Patient", owner: "Frau Eder" }),
    false,
  );
  assert.equal(isLeftoverNamelessHeuteSlot({ pet: "Nala", owner_name: "Klientel" }), false);
  assert.equal(isLeftoverNamelessHeuteSlot({ pet: "Heute-Nala" }), false);

  const from = new Date(2026, 7, 29, 9, 0);
  const rows = [
    {
      id: "noise",
      start_at: new Date(2026, 7, 31, 15, 0).toISOString(),
      status: "gelegt",
      pet: "Patient",
      owner_name: "Klientel",
    },
    {
      id: "holzer",
      start_at: new Date(2026, 7, 31, 17, 30).toISOString(),
      status: "gelegt",
      pet: "Patient",
      owner_name: "Frau Holzer",
    },
    {
      id: "named",
      start_at: new Date(2026, 7, 31, 16, 0).toISOString(),
      status: "gelegt",
      pet: "Nala",
      owner_name: "Klientel",
    },
    {
      id: "today-noise",
      start_at: new Date(2026, 7, 29, 10, 0).toISOString(),
      status: "gelegt",
      pet: "Patient",
      owner_name: "Klientel",
    },
    {
      id: "today-eder",
      start_at: new Date(2026, 7, 29, 11, 0).toISOString(),
      status: "gelegt",
      pet: "Patient",
      owner_name: "Frau Eder",
    },
  ];
  const next = nextUpcomingAppointments(rows, from);
  assert.deepEqual(
    next.items.map((a) => a.id),
    ["today-eder", "named", "holzer"],
  );
  assert.equal(next.laterHidden, 0);
  const open = openConfirmToday(rows, from);
  assert.equal(open.count, 1);
  assert.equal(open.first?.id, "today-eder");
});

test("Heute confirm queue is today's gelegt, not later days or abgesagt", () => {
  const from = new Date(2026, 7, 26, 9, 0);
  const rows = [
    { id: "a", start_at: new Date(2026, 7, 26, 8, 0).toISOString(), status: "gelegt" },
    { id: "b", start_at: new Date(2026, 7, 26, 10, 0).toISOString(), status: "bestätigt" },
    { id: "c", start_at: new Date(2026, 7, 26, 11, 0).toISOString(), status: "gelegt" },
    { id: "d", start_at: new Date(2026, 7, 26, 9, 0).toISOString(), status: "abgesagt" },
    { id: "e", start_at: new Date(2026, 7, 27, 15, 0).toISOString(), status: "gelegt" },
  ];
  const open = openConfirmToday(rows, from);
  assert.equal(open.count, 2);
  assert.equal(open.first?.id, "a");
  assert.equal(heuteSlotDomId("a"), "heute-slot-a");
  assert.equal(openConfirmLabel(0), "");
  assert.equal(openConfirmLabel(1), "1 noch zu bestätigen");
  assert.equal(openConfirmLabel(2), "2 noch zu bestätigen");
});
