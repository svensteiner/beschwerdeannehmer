import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BARGE_HOLD_MS,
  BARGE_IGNORE_MS,
  BARGE_RMS,
  LISTEN_MAX_MS,
  LISTEN_MIN_MS,
  LISTEN_QUIET_BYTES,
  LISTEN_SILENCE_MS,
  isSilentRms,
  shouldBargeIn,
  shouldStopListen,
} from "./listen.ts";

test("silence window is 1.2 s after a 400 ms floor, never a 6 s hard stop", () => {
  assert.equal(LISTEN_SILENCE_MS, 1_200);
  assert.equal(LISTEN_MIN_MS, 400);
  assert.equal(LISTEN_MAX_MS, 20_000);
  assert.equal(LISTEN_QUIET_BYTES, 400);
  assert.equal(shouldStopListen({ elapsedMs: 300, silentForMs: 2_000 }), false);
  assert.equal(shouldStopListen({ elapsedMs: 500, silentForMs: 1_200 }), true);
  assert.equal(shouldStopListen({ elapsedMs: 5_000, silentForMs: 200 }), false);
  assert.equal(shouldStopListen({ elapsedMs: 20_000, silentForMs: 0 }), true);
});

test("isSilentRms treats room tone as silence and speech as not", () => {
  assert.equal(isSilentRms(0.002), true);
  assert.equal(isSilentRms(0.08), false);
  assert.equal(isSilentRms(0.03, BARGE_RMS), true);
  assert.equal(isSilentRms(0.08, BARGE_RMS), false);
});

test("shouldBargeIn waits out speaker onset, then needs a short loud hold", () => {
  assert.equal(BARGE_IGNORE_MS, 450);
  assert.equal(BARGE_HOLD_MS, 180);
  assert.equal(shouldBargeIn({ elapsedMs: 200, loudForMs: 400 }), false);
  assert.equal(shouldBargeIn({ elapsedMs: 500, loudForMs: 80 }), false);
  assert.equal(shouldBargeIn({ elapsedMs: 500, loudForMs: 180 }), true);
});
