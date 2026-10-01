import assert from "node:assert/strict";
import { test } from "node:test";
import { SIGNUP_CLOSED_TIME } from "../alma/hours.ts";
import {
  formatConnectorTime,
  mapConnectorHoursToRows,
  normalizeConnectorDay,
  praxissoftwareNamesFrom,
} from "./praxissoftware-import.ts";

test("normalizeConnectorDay accepts German, English and ISO weekday forms", () => {
  assert.equal(normalizeConnectorDay("Montag"), 0);
  assert.equal(normalizeConnectorDay("monday"), 0);
  assert.equal(normalizeConnectorDay("Mo"), 0);
  assert.equal(normalizeConnectorDay("1"), 0);
  assert.equal(normalizeConnectorDay("Sonntag"), 6);
  assert.equal(normalizeConnectorDay("sunday"), 6);
  assert.equal(normalizeConnectorDay("0"), 6);
  assert.equal(normalizeConnectorDay("7"), 6);
  assert.equal(normalizeConnectorDay("nicht ein tag"), null);
});

test("formatConnectorTime strips a leading zero like the settings hours", () => {
  assert.equal(formatConnectorTime("08:00"), "8:00");
  assert.equal(formatConnectorTime("18:30"), "18:30");
  assert.equal(formatConnectorTime("kaputt"), "kaputt");
});

test("mapConnectorHoursToRows groups multiple windows per day, formats like SIGNUP_WEEKDAY_TIME", () => {
  const rows = mapConnectorHoursToRows({
    opening: [
      { day: "Montag", start: "08:00", end: "12:00" },
      { day: "Montag", start: "14:00", end: "18:00" },
      { day: "Dienstag", start: "08:00", end: "12:00" },
    ],
    closedDays: ["Samstag", "Sonntag"],
  });
  assert.deepEqual(rows, [
    { day: "Montag", time: "8:00–12:00, 14:00–18:00" },
    { day: "Dienstag", time: "8:00–12:00" },
    { day: "Samstag", time: SIGNUP_CLOSED_TIME },
    { day: "Sonntag", time: SIGNUP_CLOSED_TIME },
  ]);
});

test("mapConnectorHoursToRows returns empty when the connector has no opening windows at all", () => {
  assert.deepEqual(mapConnectorHoursToRows({ opening: [], closedDays: [] }), []);
  assert.deepEqual(mapConnectorHoursToRows(null), []);
  assert.deepEqual(mapConnectorHoursToRows(undefined), []);
});

test("mapConnectorHoursToRows skips windows with an unrecognized day rather than guessing", () => {
  const rows = mapConnectorHoursToRows({
    opening: [{ day: "??", start: "08:00", end: "12:00" }],
    closedDays: [],
  });
  assert.deepEqual(rows, []);
});

test("praxissoftwareNamesFrom joins trimmed, non-empty names one per line", () => {
  assert.equal(
    praxissoftwareNamesFrom([{ name: " Dr. Stein " }, { name: "" }, { name: "Dr. Berger" }]),
    "Dr. Stein\nDr. Berger",
  );
  assert.equal(praxissoftwareNamesFrom([]), "");
  assert.equal(praxissoftwareNamesFrom(undefined), "");
});
