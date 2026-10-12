import assert from "node:assert/strict";
import test from "node:test";
import { complaintHandoff } from "./complaint-workflow.js";

test("Sicherheitsvorgang landet sichtbar bei Sicherheit und Technik", () => {
  const handoff = complaintHandoff({ priority: "sicherheit", location: "Garage Mitte" });
  assert.equal(handoff.owner, "Sicherheit / Technik");
  assert.match(handoff.nextStep, /Sofort prüfen/i);
});

test("unvollständiger Normalvorgang nennt nur die fehlenden Angaben", () => {
  const handoff = complaintHandoff({ priority: "normal", location: "Garage Mitte", category: "E-Laden" });
  assert.deepEqual(handoff.missing, ["Zeitpunkt", "Rückrufnummer"]);
  assert.match(handoff.nextStep, /Zeitpunkt, Rückrufnummer/);
});

test("vollständiger Normalvorgang ist bereit für die Bearbeitung", () => {
  const handoff = complaintHandoff({ priority: "normal", location: "Garage Mitte", category: "E-Laden", occurredAt: "heute", contactPhone: "0664 123 45 67" });
  assert.equal(handoff.owner, "Kundenservice");
  assert.equal(handoff.missing.length, 0);
  assert.match(handoff.nextStep, /Rückmeldung vorbereiten/i);
});
