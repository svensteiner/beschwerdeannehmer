import assert from "node:assert/strict";
import test from "node:test";
import { demoLocations, knownLocationFrom, locationNames } from "./locations.js";

test("stellt die offiziellen Demo-Standorte zentral für Formulare bereit", () => {
  assert.deepEqual(locationNames, demoLocations.map((location) => location.name));
  assert.deepEqual(locationNames, ["Hauptbahnhof", "Stadtpark"]);
});

test("erkennt den offiziellen Demo-Standort im Satz", () => {
  assert.equal(knownLocationFrom("Die Schranke beim Hauptbahnhof ist geschlossen."), "Hauptbahnhof");
});

test("ordnet einen Alias dem offiziellen Demo-Standort zu", () => {
  assert.equal(knownLocationFrom("In der Bahnhofgarage kann ich nicht ausfahren."), "Hauptbahnhof");
});

test("lässt unbekannte Standorte offen", () => {
  assert.equal(knownLocationFrom("Das Problem ist in der Garage Westtor."), "");
});
