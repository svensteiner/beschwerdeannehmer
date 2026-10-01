import assert from "node:assert/strict";
import { test } from "node:test";
import { OPENAI_TTS_VOICE } from "./llm-runtime.ts";
import {
  VOICES,
  greetingSrc,
  voicePreviewText,
  voiceSpeed,
  voiceStyle,
} from "./voices.ts";

test("live voice preview names the Tafel, never Huber", () => {
  assert.equal(
    voicePreviewText("Tafel Graz WA"),
    "Grüß Gott, Tafel Graz WA. Silvia am Apparat.",
  );
  assert.match(voicePreviewText("Murtal"), /Murtal/);
  assert.doesNotMatch(
    voicePreviewText("Tafel Graz WA"),
    /Huber|Fritz|Josefstadt/,
  );
  assert.equal(voicePreviewText(""), "");
  assert.equal(voicePreviewText("  "), "");
});

test("demo greeting files stay under /sounds/voices", () => {
  assert.equal(greetingSrc("ara"), "/sounds/voices/ara.mp3");
  assert.equal(greetingSrc("liora"), "/sounds/voices/liora.mp3");
});

test("jede Stimme hat einen eigenen, nicht-leeren Stil (Owner-Feedback: zu wenig Unterschied)", () => {
  const styles = VOICES.map((v) => voiceStyle(v.id));
  for (const style of styles) {
    assert.ok(style.trim().length > 0);
  }
  assert.equal(new Set(styles).size, styles.length);
});

test("Tempo-Spread ist deutlich (0.8-1.1) und je Stimme unterschiedlich", () => {
  const speeds = VOICES.map((v) => voiceSpeed(v.id));
  for (const speed of speeds) {
    assert.ok(speed >= 0.8 && speed <= 1.1, `speed ${speed} out of range`);
  }
  assert.equal(new Set(speeds).size, speeds.length);
});

test("OpenAI-Stimmen-Mapping hat keine Duplikate (vier hoerbar unterschiedliche Stimmen)", () => {
  const mapped = VOICES.map((v) => OPENAI_TTS_VOICE[v.id]);
  assert.equal(new Set(mapped).size, mapped.length);
});
