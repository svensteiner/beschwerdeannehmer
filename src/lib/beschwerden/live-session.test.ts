import assert from "node:assert/strict";
import test from "node:test";
import { openAiLiveSession } from "./live-session.js";

test("Live-Sitzung ist kurzlebig, deutschsprachig ausgerichtet und ohne Zugangsdaten", () => {
  const config = openAiLiveSession();
  assert.equal(config.expires_after.seconds, 60);
  assert.equal(config.session.type, "realtime");
  assert.equal(config.session.model, "gpt-realtime-2.1");
  assert.equal(config.session.audio.input.turn_detection.type, "semantic_vad");
  assert.equal(config.session.audio.input.turn_detection.eagerness, "low");
  assert.match(config.session.instructions, /deutschsprachig/i);
  assert.doesNotMatch(JSON.stringify(config), /api[_-]?key|sk-/i);
});
