import assert from "node:assert/strict";
import test from "node:test";
import {
  isShortBookingConfirmation,
  validStoredAppointment,
  type StoredPracticeAppointment,
} from "./appointment-confirmation.ts";

const valid: StoredPracticeAppointment = {
  id: "apt-1",
  practice_id: "practice-a",
  start_at: "2026-09-13T08:30:00.000Z",
  status: "gelegt",
  owner_name: "Frau Test",
  pet: "Bella",
};

test("gültige Terminreferenz wird ausschließlich praxisgebunden akzeptiert", () => {
  assert.equal(validStoredAppointment(valid, "apt-1", "practice-a"), true);
  assert.equal(validStoredAppointment(valid, "apt-1", "practice-b"), false);
  assert.equal(validStoredAppointment(valid, "missing", "practice-a"), false);
});

test("stornierte und ungültig datierte Termine sind keine gültige Wiederverwendung", () => {
  assert.equal(validStoredAppointment({ ...valid, status: "abgesagt" }, "apt-1", "practice-a"), false);
  assert.equal(validStoredAppointment({ ...valid, start_at: "not-a-date" }, "apt-1", "practice-a"), false);
});

test("nur kurze Bestätigung ohne neue Frage oder Änderung darf wiederverwenden", () => {
  assert.equal(isShortBookingConfirmation("Ja, passt."), true);
  assert.equal(isShortBookingConfirmation("passt"), true);
  assert.equal(isShortBookingConfirmation("Ja, was kostet das?"), false);
  assert.equal(isShortBookingConfirmation("Ja, aber morgen"), false);
  assert.equal(isShortBookingConfirmation("morgen um 15 Uhr"), false);
});
