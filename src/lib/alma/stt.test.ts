import assert from "node:assert/strict";
import { test } from "node:test";
import {
  STT_FAIL_TOAST_ID,
  STT_CLIENT_TIMEOUT_MS,
  sttBrowserError,
  sttFailFromTranscribe,
  sttFailToast,
} from "./stt.ts";

test("browser SpeechRecognition abort is silent; no-speech and network tell the Kassa to type", () => {
  assert.equal(sttBrowserError("aborted"), null);
  assert.equal(sttBrowserError(""), null);
  assert.equal(sttBrowserError("no-speech"), "no-speech");
  assert.equal(sttBrowserError("network"), "network");
  assert.equal(sttBrowserError("not-allowed"), "not-allowed");
  assert.equal(sttBrowserError("audio-capture"), "error");
  assert.match(sttFailToast("no-speech"), /tippen/);
  assert.match(sttFailToast("empty"), /nicht erkannt/);
  assert.equal(sttFailToast("missing"), "Spracherkennung ist derzeit nicht verfügbar. Bitte tippen Sie Ihre Nachricht ein.");
  assert.doesNotMatch(sttFailToast("missing"), /Whisper|OPENAI_API_KEY|SILVIA_STT_URL|\.env|OpenAI|VITE_/);
  assert.equal(STT_FAIL_TOAST_ID, "sprechen-stt-fail");
  assert.equal(STT_CLIENT_TIMEOUT_MS, 35_000);
});

test("STT fallback maps server reasons, never invents a transcript", () => {
  assert.equal(sttFailFromTranscribe({ ok: false, text: "", reason: "missing" }), "missing");
  assert.equal(sttFailFromTranscribe({ ok: false, text: "", reason: "rate" }), "rate");
  assert.equal(sttFailFromTranscribe({ ok: false, text: "", reason: "empty" }), "empty");
  assert.equal(sttFailFromTranscribe({ ok: false, text: "", reason: "quiet" }), "quiet");
  assert.equal(sttFailFromTranscribe({ ok: false, text: "" }), "error");
  assert.equal(sttFailFromTranscribe({ ok: true, text: "Grüß Gott" }), "error");
});
