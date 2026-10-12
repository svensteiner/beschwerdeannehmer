import assert from "node:assert/strict";
import test from "node:test";
import { normalizeComplaintTime } from "./complaint-time.js";

const now = new Date("2026-10-12T00:30:00.000Z");

test("normalisiert relative Tage nach dem Wiener Kalender", () => {
  assert.deepEqual(normalizeComplaintTime("Das war heute.", { now }), { isoDate: "2026-10-12", originalText: "heute" });
  assert.deepEqual(normalizeComplaintTime("Gestern war die Schranke defekt.", { now }), { isoDate: "2026-10-11", originalText: "Gestern" });
  assert.deepEqual(normalizeComplaintTime("Das Problem bestand vorgestern.", { now }), { isoDate: "2026-10-10", originalText: "vorgestern" });
});

test("normalisiert ein vollständiges deutsches Datum und behält den Originaltext", () => {
  assert.deepEqual(normalizeComplaintTime("Am 05.09.2026 war die Ausfahrt blockiert.", { now }), {
    isoDate: "2026-09-05",
    originalText: "05.09.2026",
  });
});

test("lehnt ungültige oder fehlende Datumsangaben ab", () => {
  assert.equal(normalizeComplaintTime("Am 31.02.2026 war etwas nicht in Ordnung.", { now }), null);
  assert.equal(normalizeComplaintTime("Irgendwann letzte Woche.", { now }), null);
});
