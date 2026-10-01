import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GREETING,
  SPEAK_TEXT_LIMIT,
  TTS_FAIL_TOAST_ID,
  VOICE_SAMPLES,
  forSpeech,
  speakZip,
  speakNextChunk,
  speechChunks,
  ttsFailToast,
  voiceSampleAt,
} from "./speak-text.ts";
import { TTS_CLIENT_TIMEOUT_MS } from "./speak.ts";

test("forSpeech keeps Huber demo markers and expands tenant street/PLZ", () => {
  assert.match(forSpeech("U2 Rathaus"), /U zwei/);
  assert.match(forSpeech("Dr. Quelle"), /Doktor Quelle/);
  assert.match(forSpeech("Nr. 12, Herrengasse"), /Nummer 12/);
  assert.match(forSpeech("Kaiser-Josef-Str. 4"), /Straße 4/);
  assert.match(forSpeech("PLZ 8010"), /Postleitzahl acht null eins null/);
  assert.match(forSpeech("8010 Graz"), /acht null eins null Graz/);
  assert.match(forSpeech("1080 Wien"), /zehn achtzig Wien/);
  assert.doesNotMatch(forSpeech("8010 Graz"), /Doktor Huber|Josefstadt/);
});

test("speakZip reads Austrian PLZ digit by digit", () => {
  assert.equal(speakZip("8010"), "acht null eins null");
  assert.equal(speakZip("1010"), "eins null eins null");
});

test("live reply is not cut at 520 characters", () => {
  assert.equal(SPEAK_TEXT_LIMIT, 1200);
  const long = "Grüß Gott. ".repeat(80);
  assert.ok(long.length > 520);
  assert.ok(forSpeech(long).length > 520);
});

test("GREETING stays Huber demo copy", () => {
  assert.match(GREETING, /Huber/);
  assert.match(ttsFailToast(), /tippen/);
  assert.equal(TTS_FAIL_TOAST_ID, "sprechen-tts-fail");
  assert.equal(TTS_CLIENT_TIMEOUT_MS, 35_000);
});

test("forSpeech never leaves [pause] for the TTS model to speak", () => {
  assert.doesNotMatch(
    forSpeech("Grüß Gott. Wie kann ich helfen?"),
    /\[pause\]/,
  );
  assert.doesNotMatch(forSpeech("Ja [pause] genau."), /\[pause\]/);
});

test("speechChunks starts the first sentence without waiting for the rest", () => {
  const chunks = speechChunks(
    "Grüß Gott. Der nächste freie Termin ist morgen um neun. Bitte bringen Sie den Impfpass mit.",
  );
  assert.ok(chunks.length >= 2);
  assert.match(chunks[0] ?? "", /Grüß Gott/);
  assert.match(chunks[1] ?? "", /Termin|Impfpass/);
  assert.ok(chunks.every((c) => !c.includes("[pause]")));
});

test("speechChunks merges a short opener into the next sentence", () => {
  const chunks = speechChunks("Ja. Der Termin liegt.");
  assert.equal(chunks.length, 1);
  assert.match(chunks[0] ?? "", /Ja\./);
  assert.match(chunks[0] ?? "", /Termin liegt/);
});

test("speakNextChunk returns the first sentence and the leftover for the next POST", () => {
  const next = speakNextChunk(
    "Grüß Gott. Der nächste freie Termin ist morgen um neun. Bitte bringen Sie den Impfpass mit.",
  );
  assert.match(next.speak, /Grüß Gott/);
  assert.doesNotMatch(next.speak, /Impfpass/);
  assert.match(next.rest, /Impfpass/);
  const once = speakNextChunk("Grüß Gott.");
  assert.equal(once.rest, "");
});

test("VOICE_SAMPLES: zehn schlichte, unterschiedliche Saetze ohne Verkaufston", () => {
  assert.equal(VOICE_SAMPLES.length, 10);
  const seen = new Set(VOICE_SAMPLES);
  assert.equal(
    seen.size,
    VOICE_SAMPLES.length,
    "alle Saetze muessen unterschiedlich sein",
  );
  for (const sample of VOICE_SAMPLES) {
    assert.ok(sample.length <= 140, `zu lang (${sample.length}): ${sample}`);
    assert.doesNotMatch(sample, /!/, `kein Ausrufezeichen: ${sample}`);
    assert.doesNotMatch(sample, /gerne/i, `kein Verkaufston: ${sample}`);
  }
});

test("VOICE_SAMPLES bleiben nach forSpeech TTS-sicher (kein [pause])", () => {
  for (const sample of VOICE_SAMPLES) {
    assert.doesNotMatch(forSpeech(sample), /\[pause\]/);
  }
});

test("voiceSampleAt wraps around VOICE_SAMPLES (pure, modulo)", () => {
  assert.equal(voiceSampleAt(0), VOICE_SAMPLES[0]);
  assert.equal(voiceSampleAt(VOICE_SAMPLES.length), VOICE_SAMPLES[0]);
  assert.equal(voiceSampleAt(VOICE_SAMPLES.length + 2), VOICE_SAMPLES[2]);
  assert.equal(voiceSampleAt(-1), VOICE_SAMPLES[VOICE_SAMPLES.length - 1]);
});
