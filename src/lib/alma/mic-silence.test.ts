import assert from "node:assert/strict";
import { test } from "node:test";
import { MIC_SILENCE_MS, MIC_SILENCE_PEAK, MicSilenceWatch, isMicSilentPeak } from "./mic-silence.ts";

test("isMicSilentPeak treats near-zero peaks as no sound", () => {
  assert.equal(isMicSilentPeak(0), true);
  assert.equal(isMicSilentPeak(0.001), true);
  assert.equal(isMicSilentPeak(MIC_SILENCE_PEAK), true);
  assert.equal(isMicSilentPeak(0.02), false);
});

test("continuous silence for >= 3 s trips the watch exactly once", () => {
  const w = new MicSilenceWatch();
  assert.equal(w.sample(0, 0), false);
  assert.equal(w.sample(0, 1_000), false);
  assert.equal(w.sample(0, 2_999), false);
  assert.equal(w.sample(0, MIC_SILENCE_MS), true);
  // Stays tripped — does not fire again on the very next sample.
  assert.equal(w.sample(0, MIC_SILENCE_MS + 40), false);
});

test("a brief dip under 3 s does not trigger", () => {
  const w = new MicSilenceWatch();
  assert.equal(w.sample(0, 0), false);
  assert.equal(w.sample(0, 1_500), false);
  // Loud again before 3 s of silence accrue — resets the run.
  assert.equal(w.sample(0.05, 1_600), false);
  assert.equal(w.sample(0, 1_700), false);
  assert.equal(w.sample(0, 1_700 + MIC_SILENCE_MS - 1), false);
});

test("normal audio never trips the watch", () => {
  const w = new MicSilenceWatch();
  for (let t = 0; t <= 10_000; t += 250) {
    assert.equal(w.sample(0.06, t), false);
  }
});

test("reset() allows the watch to trip again after firing", () => {
  const w = new MicSilenceWatch();
  assert.equal(w.sample(0, 0), false);
  assert.equal(w.sample(0, MIC_SILENCE_MS), true);
  w.reset();
  assert.equal(w.sample(0, MIC_SILENCE_MS + 100), false);
  assert.equal(w.sample(0, 2 * MIC_SILENCE_MS + 100), true);
});
