import assert from "node:assert/strict";
import { test } from "node:test";
import { mapThreadRow } from "./protocol-rows.ts";

test("Nachrichten ignores a leftover Patient Akte and keeps the spoken Handy", () => {
  const row = mapThreadRow({
    id: "t1",
    name: "Klientel Leitgeb",
    pet: "Patient",
    preview: "Termin bestätigt: Patient\n0664 55 69 67",
    unread: 0,
    intern: false,
    created_at: "2026-08-29T09:50:00.000Z",
    owner_phone: "0664 11 11 11",
    owner_email: "stolen@example.com",
    messages: [
      { from: "alma", text: "Termin liegt.", at: "2026-08-29T09:50:00.000Z" },
      {
        from: "anrufer",
        text: "Ich bin Frau Leitgeb. Meine Nummer ist 0664 55 69 67, leitgeb@example.com.",
        at: "2026-08-29T09:50:10.000Z",
      },
    ],
  });
  assert.equal(row.owner_phone, "0664556967");
  assert.notEqual(row.owner_phone, "0664 11 11 11");
  assert.equal(row.owner_email, "leitgeb@example.com");
  assert.notEqual(row.owner_email, "stolen@example.com");
});

test("named Nachrichten Akte still wins over leftover spoken Klientel", () => {
  const row = mapThreadRow({
    id: "t2",
    name: "Frau Nowak",
    pet: "Mizzi",
    preview: "Termin bestätigt: Mizzi",
    unread: 0,
    intern: false,
    created_at: "2026-08-29T09:51:00.000Z",
    owner_phone: "0664 18 12 008",
    owner_email: "nowak@example.com",
    messages: [{ from: "alma", text: "Termin liegt.", at: "2026-08-29T09:51:00.000Z" }],
  });
  assert.equal(row.owner_phone, "0664 18 12 008");
  assert.equal(row.owner_email, "nowak@example.com");
});
