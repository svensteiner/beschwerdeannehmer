import assert from "node:assert/strict";
import test from "node:test";
import { demoDesk } from "../alma/desk";
import { decideLiveTurn } from "./turn";

const budget = { tenantId: "t", monthKey: "2026-09", usedSeconds: 0, limitSeconds: 3600 };
const run = (text: string, b = budget) => decideLiveTurn({ text, desk: demoDesk(), budget: b });

test("Notfall übergibt sofort und markiert die Aktion", () => {
  const r = run("Mein Hund atmet nicht mehr");
  assert.equal(r.handoff, true);
  assert.equal(r.emergency, true);
  assert.equal(r.actionType, "emergency");
});

test("Routineanfrage bleibt bei der KI", () => {
  const r = run("Wann ist die Tollwutimpfung fällig?");
  assert.equal(r.handoff, false);
  assert.ok(r.speak.length > 0);
});

test("Leeres Minutenkonto übergibt an die Praxis", () => {
  const r = run("Ich möchte einen Termin", { ...budget, usedSeconds: 3600 });
  assert.equal(r.handoff, true);
  assert.equal(r.actionType, "handoff");
});

test("Gesprochener Text enthält keine fremden Nummern", () => {
  const r = run("Bitte rufen Sie mich zurück, meine Nummer ist 0664 1234567");
  assert.doesNotMatch(r.speak, /0650 7654321/);
});
