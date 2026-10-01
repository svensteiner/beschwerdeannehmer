import assert from "node:assert/strict";
import test from "node:test";
import { buildLiveInstructions, disclosureGreeting, speakableServerReply } from "./prompt";
import { localReply } from "../alma/ask-alma";
import { demoDesk } from "../alma/desk";

test("Runde 11 · KI-Ansage (Art. 50) steht im Prompt und in der Begrüßung", () => {
  const text = buildLiveInstructions({ practiceName: "Tierarztpraxis Muster", hoursLines: ["Mo–Fr 8–12"], nightPhone: "" });
  assert.match(text, /digitalen Assistentin von Tierarztpraxis Muster/);
  assert.match(disclosureGreeting("Muster"), /digitalen Assistentin/);
});

test("Runde 11 · Rückrufnummer der Anrufenden darf zur Bestätigung zurück, fremde Nummern nicht", () => {
  const out = speakableServerReply("Ich notiere 0664 1234567, nicht 0650 7654321.", ["0664 1234567"]);
  assert.match(out, /0664 1234567/);
  assert.doesNotMatch(out, /0650 7654321/);
});

test("Runde 11 · Notfall im Anrufpfad liefert Notfall-Aktion, Routine nicht", () => {
  const type = (m: string) => localReply(m, [], "standard", demoDesk(), false).action.type;
  for (const m of ["Mein Hund atmet nicht mehr", "Die Katze wurde überfahren", "Er hat Rattengift gefressen"]) assert.equal(type(m), "emergency", m);
  for (const m of ["Wann ist die Tollwutimpfung fällig?", "Geburtsdatum vom Hund ist 3.5.2020", "Ich möchte jetzt einen Termin für den Bluttest"]) assert.notEqual(type(m), "emergency", m);
});

test("Runde 11 · Modell-Auszug der Akte enthält weder Chip, Handy, E-Mail noch IBAN", async () => {
  const { redactStoredContact } = await import("../alma/llm");
  const out = redactStoredContact("Halter x@y.at, 0664 1234567, Chip 123456789012345, AT611904300234573201");
  assert.doesNotMatch(out, /x@y\.at|1234567|123456789012345|AT611904/);
});
