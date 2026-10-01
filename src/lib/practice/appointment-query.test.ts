import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appointmentMatchesNeedle,
  appointmentSearchNeedle,
  calendarChipId,
  calendarDayKey,
  calendarSlotId,
  appointmentsOnDay,
  gelegtCountOnDay,
  kalenderChipOpenLabel,
  kalenderDayFromSearch,
  kalenderDaySearch,
  kalenderQueryFromSearch,
  kalenderSearch,
  kalenderAppointmentSearch,
  dateFromDayKey,
} from "./appointment-query.ts";

test("Kalender search matches pet, Halterin, E-Mail, kind, and Handy, not a neighbor", () => {
  assert.equal(appointmentSearchNeedle("  Momo%_  "), "momo");
  const momo = {
    pet: "Momo",
    owner_name: "Frau Nowak",
    kind: "Kontrolle",
    vet: "Dr. Confirm",
    status: "gelegt",
    owner_phone: "0664 181 20 08",
    owner_email: "nowak@example.com",
    channel: "kassa",
  };
  const nala = {
    pet: "Nala",
    owner_name: "Frau Berger",
    kind: "Impfung",
    owner_phone: "0664 111 11 11",
    owner_email: "berger@example.com",
  };
  assert.equal(appointmentMatchesNeedle("momo", momo), true);
  assert.equal(appointmentMatchesNeedle("momo", nala), false);
  assert.equal(appointmentMatchesNeedle("nowak", momo), true);
  assert.equal(appointmentMatchesNeedle("nowak@example.com", momo), true);
  assert.equal(appointmentMatchesNeedle("nowak@", nala), false);
  assert.equal(appointmentMatchesNeedle("0664 181", momo), true);
  assert.equal(appointmentMatchesNeedle("kontrolle", momo), true);
  assert.equal(appointmentMatchesNeedle("impfung", momo), false);
  assert.equal(appointmentMatchesNeedle("gelegt", momo), true);
  assert.equal(appointmentMatchesNeedle("kassa", momo), true);
  assert.equal(calendarChipId("2026-08-27T15:00:00"), "kalender-tag-2026-08-27");
  assert.equal(calendarChipId(new Date(2026, 7, 27, 0, 0, 0)), "kalender-tag-2026-08-27");
  assert.equal(calendarDayKey(new Date(2026, 7, 27, 0, 30, 0)), "2026-08-27");
  assert.equal(calendarSlotId("apt_momo"), "kalender-slot-apt_momo");
});

test("Kalender chips count gelegt on that local day, not bestätigt or another day", () => {
  const day = new Date(2026, 7, 27, 0, 0, 0);
  const rows = [
    { start_at: new Date(2026, 7, 27, 15, 0).toISOString(), status: "gelegt" },
    { start_at: new Date(2026, 7, 27, 15, 30).toISOString(), status: "gelegt" },
    { start_at: new Date(2026, 7, 27, 16, 0).toISOString(), status: "bestätigt" },
    { start_at: new Date(2026, 7, 27, 9, 0).toISOString(), status: "abgesagt" },
    { start_at: new Date(2026, 7, 26, 11, 0).toISOString(), status: "gelegt" },
  ];
  assert.equal(gelegtCountOnDay(rows, day), 2);
  assert.equal(gelegtCountOnDay(rows, new Date(2026, 7, 26, 0, 0, 0)), 1);
  assert.equal(gelegtCountOnDay(rows, "2026-08-28"), 0);
  const leftoverDay = new Date(2026, 7, 31, 0, 0, 0);
  const leftoverRows: Array<{
    start_at: string;
    status: string;
    pet: string;
    owner_name: string;
    owner_phone?: string;
  }> = [
    {
      start_at: new Date(2026, 7, 31, 8, 0).toISOString(),
      status: "gelegt",
      pet: "Patient",
      owner_name: "Klientel",
    },
    {
      start_at: new Date(2026, 7, 31, 17, 30).toISOString(),
      status: "gelegt",
      pet: "Patient",
      owner_name: "Frau Holzer",
    },
    {
      start_at: new Date(2026, 7, 31, 17, 0).toISOString(),
      status: "gelegt",
      pet: "Patient",
      owner_name: "Frau Eder",
    },
  ];
  assert.equal(gelegtCountOnDay(leftoverRows, leftoverDay), 2);
  leftoverRows[0] = {
    ...leftoverRows[0],
    owner_phone: "0664 55 70 23",
  };
  assert.equal(gelegtCountOnDay(leftoverRows, leftoverDay), 3);
  leftoverRows[0] = { ...leftoverRows[0], owner_phone: "" };
  assert.deepEqual(
    appointmentsOnDay(leftoverRows, leftoverDay).map((a) => a.owner_name),
    ["Frau Eder", "Frau Holzer"],
  );
  assert.equal(kalenderChipOpenLabel(0), "");
  assert.equal(kalenderChipOpenLabel(1), "1 noch zu bestätigen");
  assert.equal(kalenderChipOpenLabel(2), "2 noch zu bestätigen");
  assert.equal(kalenderDayFromSearch("2026-08-27"), "2026-08-27");
  assert.equal(kalenderDayFromSearch("nope"), undefined);
  assert.equal(calendarDayKey(dateFromDayKey("2026-08-27")), "2026-08-27");
  assert.deepEqual(kalenderDaySearch(new Date(2026, 7, 27), "apt_momo"), {
    a: "apt_momo",
    d: "2026-08-27",
  });
  assert.deepEqual(kalenderDaySearch("2026-08-27"), { d: "2026-08-27" });
  assert.deepEqual(kalenderDaySearch("2026-08-31", "apt_holzer", "Holzer"), {
    a: "apt_holzer",
    d: "2026-08-31",
    q: "Holzer",
  });
  assert.equal(kalenderQueryFromSearch("  Holzer  "), "Holzer");
  assert.equal(kalenderQueryFromSearch("   "), undefined);
  assert.deepEqual(kalenderSearch({ a: "x", d: "nope" }), { a: "x" });
  assert.deepEqual(kalenderSearch({ a: "  ", d: "2026-08-27" }), { d: "2026-08-27" });
  assert.deepEqual(kalenderSearch({ d: "2026-08-31", q: "  Holzer  " }), {
    d: "2026-08-31",
    q: "Holzer",
  });
  assert.deepEqual(kalenderSearch({ d: "2026-08-31", q: "   " }), { d: "2026-08-31" });
  assert.deepEqual(
    kalenderAppointmentSearch({
      id: "apt_momo",
      start_at: new Date(2026, 7, 27, 15, 0).toISOString(),
    }),
    { a: "apt_momo", d: "2026-08-27" },
  );
});
