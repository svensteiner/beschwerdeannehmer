import assert from "node:assert/strict";
import { test } from "node:test";
import { akteContactForAppointment, mapAppointmentConfirm, mapAppointmentRow } from "./appointment-rows.ts";

test("Heute ignores a leftover Patient Akte and keeps the Walk-in Halterin", () => {
  const row = mapAppointmentRow({
    id: "apt1",
    start_at: "2026-08-31T07:00:00.000Z",
    minutes: 20,
    owner_name: "Frau Stolen",
    spoken_owner: "Klientel Wallner",
    pet: "Patient",
    kind: "Impfung",
    vet: "Frau Doktor",
    channel: "kassa",
    status: "gelegt",
    owner_phone: "0664 11 11 11",
    owner_email: "stolen@example.com",
  });
  assert.equal(row.owner_name, "Klientel Wallner");
  assert.notEqual(row.owner_name, "Frau Stolen");
  assert.equal(row.owner_phone, "");
  assert.notEqual(row.owner_phone, "0664 11 11 11");
  assert.equal(row.owner_email, "");
  assert.notEqual(row.owner_email, "stolen@example.com");
});

test("nameless Walk-in Patient keeps the typed Handy when Halterin matches", () => {
  const row = mapAppointmentRow({
    id: "apt2",
    start_at: "2026-08-31T07:20:00.000Z",
    minutes: 20,
    owner_name: "Frau Wallner",
    spoken_owner: "Frau Wallner",
    pet: "Patient",
    kind: "Impfung",
    vet: "Frau Doktor",
    channel: "kassa",
    status: "gelegt",
    owner_phone: "0664 55 69 78",
    owner_email: "wallner.heute@example.com",
  });
  assert.equal(row.owner_name, "Frau Wallner");
  assert.equal(row.owner_phone, "0664 55 69 78");
  assert.equal(row.owner_email, "wallner.heute@example.com");
});

test("named Heute Akte still wins over a leftover spoken Klientel", () => {
  const row = mapAppointmentRow({
    id: "apt3",
    start_at: "2026-08-31T07:40:00.000Z",
    minutes: 20,
    owner_name: "Frau Nowak",
    spoken_owner: "Klientel",
    pet: "Mizzi",
    kind: "Kontrolle",
    vet: "Frau Doktor",
    channel: "telefon",
    status: "gelegt",
    owner_phone: "0664 18 12 008",
    owner_email: "nowak@example.com",
  });
  assert.equal(row.owner_name, "Frau Nowak");
  assert.equal(row.owner_phone, "0664 18 12 008");
  assert.equal(row.owner_email, "nowak@example.com");
});

test("Sprechen Bestätigen ignores leftover Patient Handy", () => {
  const stolen = mapAppointmentConfirm({
    pet: "Patient",
    owner_name: "Frau Stolen",
    spoken_owner: "Klientel",
    phone: "0664 11 11 11",
    email: "stolen@example.com",
  });
  assert.equal(stolen.owner, "Klientel");
  assert.equal(stolen.phone, "");
  assert.equal(stolen.email, "");
  const matched = mapAppointmentConfirm({
    pet: "Patient",
    owner_name: "Frau Wallner",
    spoken_owner: "Frau Wallner",
    phone: "0664 55 69 78",
    email: "wallner.heute@example.com",
  });
  assert.equal(matched.owner, "Frau Wallner");
  assert.equal(matched.phone, "0664 55 69 78");
  assert.equal(matched.email, "wallner.heute@example.com");
  assert.equal(akteContactForAppointment("Nummer", "0664 11 11 11", "Frau Stolen", "Klientel"), "");
  assert.equal(akteContactForAppointment("Nala", "0664 11 11 11", "Frau Stolen", "Klientel"), "0664 11 11 11");
});
