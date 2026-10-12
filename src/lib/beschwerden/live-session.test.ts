import assert from "node:assert/strict";
import test from "node:test";
import { garageVoiceProfile, openAiLiveSession } from "./live-session.js";

test("Live-Sitzung ist deutschsprachig ausgerichtet, unterbrechbar und ohne Zugangsdaten", () => {
  const config = openAiLiveSession();
  assert.equal(config.type, "realtime");
  assert.equal(config.model, "gpt-realtime-2.1");
  assert.equal(config.audio.input.turn_detection.type, "semantic_vad");
  assert.equal(config.audio.input.turn_detection.eagerness, "low");
  assert.equal(config.audio.input.transcription.language, "de");
  assert.match(config.audio.input.transcription.prompt, /Parkticket/i);
  assert.match(config.instructions, /österreichisches Hochdeutsch/i);
  assert.match(config.instructions, /ohne dramatisch/i);
  assert.doesNotMatch(JSON.stringify(config), /api[_-]?key|sk-/i);
});

test("Stimmprofil bleibt ein kurzer, separat pflegbarer Baustein", () => {
  assert.ok(garageVoiceProfile.length >= 8);
  assert.match(garageVoiceProfile.join(" "), /Dialekt/i);
});
