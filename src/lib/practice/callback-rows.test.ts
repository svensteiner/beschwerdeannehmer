import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeCallbacks, callbackReason, mapOpenCallback } from "./callback-rows.ts";

test("callbackReason erkennt die vier Follow-up-Gründe und lehnt Erledigtes ab", () => {
  assert.equal(callbackReason("Rückrufzettel"), "rueckruf");
  assert.equal(callbackReason("Warteliste"), "warteliste");
  assert.equal(callbackReason("An die Tierarzthelferin"), "thea");
  assert.equal(callbackReason("Tafelkonflikt: Vquadrat-Termin xyz"), "konflikt");
  assert.equal(callbackReason("Auskunft hinterlegt"), null);
  assert.equal(callbackReason(""), null);
});

test("analyzeCallbacks gruppiert nach Grund und zaehlt", () => {
  const row = (id: string, action: string) =>
    mapOpenCallback({
      id,
      at: "2026-09-21T08:00:00.000Z",
      caller: "Klientel",
      pet: "Patient",
      concern: "x",
      action,
      owner_phone: "",
      owner_email: "",
    });
  const analysis = analyzeCallbacks([
    row("1", "Rückrufzettel"),
    row("2", "Warteliste"),
    row("3", "Rückrufzettel"),
  ]);
  assert.equal(analysis.total, 3);
  assert.deepEqual(analysis.byReason, [
    { reason: "rueckruf", count: 2 },
    { reason: "warteliste", count: 1 },
  ]);
});

test("mapOpenCallback konvertiert Date zu ISO und leitet reason ab", () => {
  const c = mapOpenCallback({
    id: "c1",
    at: new Date("2026-09-21T08:30:00.000Z"),
    caller: "Frau Huber",
    pet: "Mizzi",
    concern: "Zahnstein",
    action: "An die Tierarzthelferin",
    owner_phone: "0664 1",
    owner_email: "a@b.c",
  });
  assert.equal(c.at, "2026-09-21T08:30:00.000Z");
  assert.equal(c.reason, "thea");
  assert.equal(c.phone, "0664 1");
  assert.equal(c.email, "a@b.c");
});
