import assert from "node:assert/strict";
import { test } from "node:test";
import { mapEmergencyRow } from "./emergency-rows.ts";

test("Notfall ignores a leftover Patient Akte and keeps the spoken Halterin", () => {
  const row = mapEmergencyRow({
    id: "e1",
    at: "2026-08-29T09:40:00.000Z",
    owner_name: "Frau Stolen",
    spoken_owner: "Klientel Puntigam",
    pet: "Patient",
    species: "Katze",
    summary:
      "Das klingt nach einem Notfall – bitte nicht warten. Der Nachtdienst ist Nachtdienst unter 0316 38 23 36.\n0664 55 69 45",
    urgency: "notfall",
    routed_to: "Nachtdienst",
    status: "verbunden",
    owner_phone: "0664 11 11 11",
    owner_email: "stolen@example.com",
  });
  assert.equal(row.owner_name, "Klientel Puntigam");
  assert.notEqual(row.owner_name, "Frau Stolen");
  assert.equal(row.owner_phone, "0664556945");
  assert.notEqual(row.owner_phone, "0664 11 11 11");
  assert.equal(row.owner_email, "");
  assert.notEqual(row.owner_email, "stolen@example.com");
});

test("named Notfall Akte still wins over a leftover spoken Klientel", () => {
  const row = mapEmergencyRow({
    id: "e2",
    at: "2026-08-29T09:41:00.000Z",
    owner_name: "Frau Nowak",
    spoken_owner: "Klientel",
    pet: "Mizzi",
    species: "Katze",
    summary: "Katze atmet nicht",
    urgency: "notfall",
    routed_to: "Nachtdienst",
    status: "verbunden",
    owner_phone: "0664 18 12 008",
    owner_email: "nowak@example.com",
  });
  assert.equal(row.owner_name, "Frau Nowak");
  assert.equal(row.owner_phone, "0664 18 12 008");
  assert.equal(row.owner_email, "nowak@example.com");
});
