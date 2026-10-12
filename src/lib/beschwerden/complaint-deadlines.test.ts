import assert from "node:assert/strict";
import test from "node:test";
import { berechneBeschwerdefrist } from "./complaint-deadlines.js";

const createdAt = "2026-10-12T08:00:00.000Z";

test("Sicherheitsvorgänge sind binnen einer Stunde bei Sicherheit und Technik fällig", () => {
  const deadline = berechneBeschwerdefrist({ createdAt, priority: "sicherheit", now: "2026-10-12T08:30:00.000Z" });
  assert.equal(deadline.owner, "Sicherheit / Technik");
  assert.equal(deadline.dueAt, "2026-10-12T09:00:00.000Z");
  assert.equal(deadline.isOverdue, false);
});

test("dringende Vorgänge sind binnen vier Stunden fällig", () => {
  const deadline = berechneBeschwerdefrist({ createdAt, priority: "dringend", now: "2026-10-12T11:00:00.000Z" });
  assert.equal(deadline.owner, "Technik / Kundenservice");
  assert.equal(deadline.dueAt, "2026-10-12T12:00:00.000Z");
  assert.equal(deadline.isOverdue, false);
});

test("normale Vorgänge sind binnen zwei Tagen beim Kundenservice fällig", () => {
  const deadline = berechneBeschwerdefrist({ createdAt, priority: "normal", now: "2026-10-13T08:00:00.000Z" });
  assert.equal(deadline.owner, "Kundenservice");
  assert.equal(deadline.dueAt, "2026-10-14T08:00:00.000Z");
  assert.equal(deadline.isOverdue, false);
});

test("eine individuell zugeteilte Zuständigkeit bleibt erhalten und überfällige Vorgänge werden markiert", () => {
  const deadline = berechneBeschwerdefrist({
    createdAt,
    priority: "dringend",
    owner: "Haustechnik Nord",
    now: "2026-10-12T12:00:01.000Z",
  });
  assert.equal(deadline.owner, "Haustechnik Nord");
  assert.equal(deadline.isOverdue, true);
});
