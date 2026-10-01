import assert from "node:assert/strict";
import { test } from "node:test";
import { mapWaitlistRow } from "./waitlist-rows.ts";

test("mapWaitlistRow übersetzt Wunschtag und ISO-Zeitpunkt", () => {
  const row = mapWaitlistRow({
    id: "wl-1",
    at: new Date("2026-09-21T08:30:00.000Z"),
    caller: "Frau Huber",
    phone: "0664 12 34 56",
    pet: "Mizzi",
    concern: "Zahnstein-Kontrolle",
    requested_date: "2026-09-28",
    status: "offen",
  });
  assert.equal(row.id, "wl-1");
  assert.equal(row.at, "2026-09-21T08:30:00.000Z");
  assert.equal(row.caller, "Frau Huber");
  assert.equal(row.phone, "0664 12 34 56");
  assert.equal(row.pet, "Mizzi");
  assert.equal(row.concern, "Zahnstein-Kontrolle");
  assert.equal(row.requestedDate, "2026-09-28");
  assert.equal(row.status, "offen");
});

test("mapWaitlistRow lässt String-Zeitpunkte unverändert", () => {
  const row = mapWaitlistRow({
    id: "wl-2",
    at: "2026-09-21T08:30:00.000Z",
    caller: "",
    phone: "",
    pet: "Patient",
    concern: "",
    requested_date: "",
    status: "offen",
  });
  assert.equal(row.at, "2026-09-21T08:30:00.000Z");
  assert.equal(row.requestedDate, "");
  assert.equal(row.caller, "");
});
