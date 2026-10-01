import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { conversationStatusText } from "./sprechen-call-helpers.ts";

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "sprechen-call.tsx"),
  "utf8",
);
const statusSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "sprechen-call-helpers.ts"),
  "utf8",
);
test("SprechenCall nutzt nur MediaRecorder und konstruiert keine Browser-STT-Engine", () => {
  assert.match(source, /MediaRecorder/);
  assert.match(source, /startRecordFallback/);
  assert.doesNotMatch(source, /function\s+SpeechEngine/);
  assert.doesNotMatch(source, /new\s+Engine\s*\(/);
  assert.doesNotMatch(source, /SpeechRecognition\?:/);
  assert.doesNotMatch(source, /webkitSpeechRecognition\?:/);
});

test("Recorder-Signal läuft nach dem Mikrofon-Gain durch den Limiter", () => {
  // Der Limiter ist mit den übrigen Mikrofon-Konstanten in die Helfer-Datei
  // ausgelagert (Punkt 9). Er wird dort geprüft, die Verdrahtung bleibt hier.
  assert.match(
    statusSource,
    /const MIC_LIMITER = \{[\s\S]*threshold:\s*-6[\s\S]*knee:\s*0[\s\S]*ratio:\s*20[\s\S]*attack:\s*0\.003[\s\S]*release:\s*0\.25/,
  );
  assert.match(
    source,
    /const compressor = gainCtx\.createDynamicsCompressor\(\);[\s\S]*src\.connect\(gain\);[\s\S]*gain\.connect\(compressor\);[\s\S]*compressor\.connect\(dest\);[\s\S]*recStream = dest\.stream/,
  );
  assert.match(
    source,
    /gainedSource = gainCtx\.createMediaStreamSource\(dest\.stream\)/,
  );
});

test("Demoanruf behauptet weder Aktenprotokoll noch DSGVO-Siegel", () => {
  assert.match(source, /conversationStatusText\(\{/);
  assert.match(statusSource, /Demo mit erfundenen Daten/);
  assert.match(statusSource, /Gesprächsprotokoll für die Praxis/);
  assert.doesNotMatch(source, /Dokumentiert in der Akte · DSGVO/);
});

test("Demo behauptet keinen Nachrichtenversand oder verbundenen Nachtdienst", () => {
  assert.doesNotMatch(
    source,
    /Notfall an den Nachtdienst übergeben|Nachtdienst verbunden|Protokoll raus/,
  );
  assert.match(source, /Bitte den Nachtdienst selbst anrufen/);
  assert.match(source, /Nachrichten bleiben Entwürfe/);
  const board = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../lib/alma/board.ts"),
    "utf8",
  );
  assert.doesNotMatch(board, /status: "verbunden"/);
  assert.match(board, /status: "dokumentiert"/);
});

test("Statuszeile trennt Demo, Testanruf, Praxis und öffentliche Leitung", () => {
  assert.equal(
    conversationStatusText({
      training: false,
      testMode: false,
      forceDemo: true,
      live: false,
      inbound: false,
    }),
    "Demo mit erfundenen Daten",
  );
  assert.equal(
    conversationStatusText({
      training: false,
      testMode: false,
      forceDemo: false,
      live: false,
      inbound: false,
    }),
    "Demo mit erfundenen Daten",
  );
  assert.equal(
    conversationStatusText({
      training: false,
      testMode: true,
      forceDemo: false,
      live: false,
      inbound: false,
    }),
    "Testanruf",
  );
  assert.equal(
    conversationStatusText({
      training: false,
      testMode: false,
      forceDemo: false,
      live: true,
      inbound: false,
    }),
    "Gesprächsprotokoll für die Praxis",
  );
  assert.equal(
    conversationStatusText({
      training: false,
      testMode: false,
      forceDemo: false,
      live: true,
      inbound: true,
    }),
    "Anruf über Ihre Leitung",
  );
});

test("Gesprochene Homepage-Demo erlaubt lokale Hörkorrektur ohne Praxisaktion", () => {
  assert.match(source, /if \(forceDemo && origin === "speech"\)/);
  assert.match(source, /\(training \|\| forceDemo\) &&/);
  assert.match(
    source,
    /Sprachkorrektur lokal gespeichert; bereits erfasste Termine bleiben unverändert/,
  );
  assert.match(source, /writeDemoSpeechTerms\(terms\)/);
  assert.match(
    source,
    /void \(\(training \|\| forceDemo\) && correcting\s*\? correctTrainingFact\(input\)\s*: send\(input\)\)/,
  );
});
