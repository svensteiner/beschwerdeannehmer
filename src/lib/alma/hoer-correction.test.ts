import assert from "node:assert/strict";
import { test } from "node:test";
import {
  needsHoerCorrection,
  normalizeHeardForCompare,
  reportHoerCorrectionSafely,
} from "./hoer-correction.ts";

test("Hörvergleich normalisiert Satzzeichen und trimmt zuletzt", () => {
  assert.equal(normalizeHeardForCompare(" . FIP!  "), "fip");
  assert.equal(needsHoerCorrection(" . FIP! ", "FIP"), false);
  assert.equal(needsHoerCorrection(" . FIP! ", "FIP2"), true);
});

test("erneute Korrektur nutzt den vorherigen sichtbaren Begriff als Vergleich", () => {
  const previousSource = "FIP";
  assert.equal(needsHoerCorrection(previousSource, "FIP"), false);
  assert.equal(needsHoerCorrection(previousSource, "FIP2"), true);
});

test("sicherer Hörkorrektur-Report behandelt Erfolg, Ablehnung und Fehler", async () => {
  const input = { heard: "FIP", corrected: "FIP2" };
  assert.deepEqual(
    await reportHoerCorrectionSafely(async (value) => {
      assert.deepEqual(value, input);
      return { ok: true };
    }, input),
    { ok: true },
  );
  assert.deepEqual(
    await reportHoerCorrectionSafely(async () => ({ ok: false }), input),
    { ok: false },
  );
  assert.deepEqual(
    await reportHoerCorrectionSafely(async () => {
      throw new Error("transport");
    }, input),
    { ok: false },
  );
  assert.deepEqual(
    await reportHoerCorrectionSafely(async () => ({ ok: false, reason: "capacity" }), input),
    { ok: false, reason: "capacity" },
  );
});
