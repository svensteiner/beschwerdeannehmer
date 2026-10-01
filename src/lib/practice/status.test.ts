import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStatusAggregate,
  connectorHealthUrl,
  connectorCheck,
  houseVoiceLabel,
  retentionCheck,
  serviceCheckFromProbe,
  storageCheck,
  worstAmpel,
} from "./status.ts";

test("connector health URL uses the same safe boundary as live connector calls", () => {
  assert.equal(connectorHealthUrl("https://connector.example"), "https://connector.example/health");
  assert.equal(connectorHealthUrl("http://127.0.0.1:8765"), "http://127.0.0.1:8765/health");
  assert.equal(connectorHealthUrl("http://192.168.1.10:8765"), null);
  assert.equal(connectorHealthUrl("http://connector.example"), null);
  assert.equal(connectorHealthUrl("https://connector.example?target=private"), null);
});

test("serviceCheckFromProbe is green when fast, yellow when slow, red when unreachable", () => {
  assert.equal(serviceCheckFromProbe("ollama", "Ollama", 11434, { ok: true, ms: 50 }).ampel, "gruen");
  assert.equal(serviceCheckFromProbe("ollama", "Ollama", 11434, { ok: true, ms: 900 }).ampel, "gelb");
  const down = serviceCheckFromProbe("ollama", "Ollama", 11434, { ok: false, ms: 1500, reason: "timeout" });
  assert.equal(down.ampel, "rot");
  assert.match(down.detail, /Zeitüberschreitung/);
});

test("serviceCheckFromProbe keeps the port/ms detail out of the plain-language sentence", () => {
  const green = serviceCheckFromProbe("ollama", "Antworten", 11434, { ok: true, ms: 42 });
  assert.doesNotMatch(green.detail, /Port|ms\b/);
  assert.match(green.technical ?? "", /Port 11434/);
  assert.match(green.technical ?? "", /42 ms/);
  const red = serviceCheckFromProbe("ollama", "Antworten", 11434, { ok: false, ms: 0, reason: "error" });
  assert.doesNotMatch(red.detail, /Port/);
});

test("connectorCheck names the plain label 'Verbindung zur Praxissoftware', not 'Connector'", () => {
  assert.equal(connectorCheck(false, null).label, "Verbindung zur Praxissoftware");
  assert.equal(connectorCheck(true, { ok: true, ms: 10 }).label, "Verbindung zur Praxissoftware");
});

test("connectorCheck stays yellow (not red) when no Praxissoftware is hinterlegt", () => {
  const check = connectorCheck(false, null);
  assert.equal(check.ampel, "gelb");
  assert.match(check.detail, /Keine Praxissoftware/);
});

test("connectorCheck is red when configured but unreachable, green when fast", () => {
  assert.equal(connectorCheck(true, { ok: false, ms: 0, reason: "error" }).ampel, "rot");
  assert.equal(connectorCheck(true, { ok: true, ms: 30 }).ampel, "gruen");
  assert.equal(connectorCheck(true, { ok: true, ms: 900 }).ampel, "gelb");
});

test("storageCheck reads free space thresholds and never guesses without disk info", () => {
  const unknown = storageCheck(null);
  assert.equal(unknown.ampel, "gelb");
  const critical = storageCheck({ freeBytes: 1 * 1024 ** 3, totalBytes: 100 * 1024 ** 3 });
  assert.equal(critical.ampel, "rot");
  const low = storageCheck({ freeBytes: 10 * 1024 ** 3, totalBytes: 100 * 1024 ** 3 });
  assert.equal(low.ampel, "gelb");
  const fine = storageCheck({ freeBytes: 50 * 1024 ** 3, totalBytes: 100 * 1024 ** 3 });
  assert.equal(fine.ampel, "gruen");
});

test("retentionCheck names the configured Aufbewahrungsfrist and stays informational green", () => {
  const check = retentionCheck(90);
  assert.equal(check.ampel, "gruen");
  assert.match(check.detail, /90 Tagen/);
});

test("houseVoiceLabel names the Piper and Whisper box by port", () => {
  assert.equal(houseVoiceLabel("http://127.0.0.1:8179/v1/audio/speech", "tts"), "Piper");
  assert.equal(houseVoiceLabel("http://127.0.0.1:8178/v1/audio/transcriptions", "stt"), "Whisper");
  assert.equal(houseVoiceLabel("", "tts"), "Piper");
  assert.equal(houseVoiceLabel("http://192.168.1.8:9000/v1/audio/speech", "tts"), "192.168.1.8:9000");
});

test("buildStatusAggregate names the real TTS model instead of Port 8179 when given ttsHost", () => {
  const aggregate = buildStatusAggregate({
    ollama: { ok: true, ms: 10 },
    stt: { ok: true, ms: 10 },
    tts: { ok: true, ms: 40 },
    connectorConfigured: false,
    connector: null,
    disk: { freeBytes: 50 * 1024 ** 3, totalBytes: 100 * 1024 ** 3 },
    retentionDays: 90,
    ttsHost: "gpt-4o-mini-tts",
  });
  const tts = aggregate.services.find((s) => s.id === "tts");
  assert.ok(tts);
  assert.match(tts.technical ?? "", /gpt-4o-mini-tts/);
  assert.doesNotMatch(tts.technical ?? "", /Port 8179/);

  const house = buildStatusAggregate({
    ollama: { ok: true, ms: 10 },
    stt: { ok: true, ms: 10 },
    tts: { ok: true, ms: 40 },
    connectorConfigured: false,
    connector: null,
    disk: { freeBytes: 50 * 1024 ** 3, totalBytes: 100 * 1024 ** 3 },
    retentionDays: 90,
    ttsHost: "Kokoro",
    sttHost: "Whisper",
  });
  const houseTts = house.services.find((s) => s.id === "tts");
  const houseStt = house.services.find((s) => s.id === "stt");
  assert.match(houseTts?.technical ?? "", /Kokoro/);
  assert.match(houseStt?.technical ?? "", /Whisper/);
});

test("buildStatusAggregate assembles every check and worstAmpel picks the reddest one", () => {
  const green = buildStatusAggregate({
    ollama: { ok: true, ms: 10 },
    stt: { ok: true, ms: 10 },
    tts: { ok: true, ms: 10 },
    connectorConfigured: false,
    connector: null,
    disk: { freeBytes: 50 * 1024 ** 3, totalBytes: 100 * 1024 ** 3 },
    retentionDays: 90,
    now: new Date("2026-09-05T10:00:00Z"),
  });
  assert.equal(green.services.length, 4);
  assert.equal(green.generatedAt, "2026-09-05T10:00:00.000Z");
  assert.equal(worstAmpel(green), "gelb"); // connector: not configured stays yellow

  const broken = buildStatusAggregate({
    ollama: { ok: false, ms: 0, reason: "error" },
    stt: { ok: true, ms: 10 },
    tts: { ok: true, ms: 10 },
    connectorConfigured: false,
    connector: null,
    disk: { freeBytes: 50 * 1024 ** 3, totalBytes: 100 * 1024 ** 3 },
    retentionDays: 90,
  });
  assert.equal(worstAmpel(broken), "rot");
});
