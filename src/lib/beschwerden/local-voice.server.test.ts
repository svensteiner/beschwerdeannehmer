import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_STT_URL, LOCAL_TTS_URL, localVoiceHealth } from "./local-voice.server";

test("Sprachdienste sind ausschließlich auf dem eigenen Rechner definiert", () => {
  assert.match(LOCAL_STT_URL, /^http:\/\/127\.0\.0\.1:8178\//);
  assert.match(LOCAL_TTS_URL, /^http:\/\/127\.0\.0\.1:8179\//);
});

test("Sprachstatus ist nur grün, wenn Erkennung und Ausgabe erreichbar sind", async () => {
  const request = async (url: string) => new Response("", { status: url.includes("8178") ? 200 : 503 });
  assert.deepEqual(await localVoiceHealth(request), { recognition: true, speech: false, ready: false });
});
