import assert from "node:assert/strict";
import test from "node:test";
import { knownLocationFrom } from "./locations.js";

test("erkennt den offiziellen Demo-Standort im Satz", () => {
  assert.equal(knownLocationFrom("Die Schranke beim Hauptbahnhof ist geschlossen."), "Hauptbahnhof");
});

test("ordnet einen Alias dem offiziellen Demo-Standort zu", () => {
  assert.equal(knownLocationFrom("In der Bahnhofgarage kann ich nicht ausfahren."), "Hauptbahnhof");
});

test("lässt unbekannte Standorte offen", () => {
  assert.equal(knownLocationFrom("Das Problem ist in der Garage Westtor."), "");
});
