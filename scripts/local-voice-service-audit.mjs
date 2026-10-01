#!/usr/bin/env node
/**
 * Reproduzierbarer Betriebscheck der bereits laufenden lokalen Sprachdienste.
 * Er verwendet ausschließlich einen festen erfundenen Satz und direkte
 * Loopback-HTTP-Verbindungen – niemals Mikrofon, Praxisdaten oder Cloud.
 */
import { request } from "node:http";

const HOST = "127.0.0.1";
const PORTS = { stt: 8178, tts: 8179 };
const PATHS = {
  sttHealth: "/health",
  ttsHealth: "/health",
  stt: "/v1/audio/transcriptions",
  tts: "/v1/audio/speech",
};
const TIMEOUT_MS = 35_000;
const SYNTHETIC_TEXT = "Dies ist eine rein erfundene technische Sprachprobe.";

function localRequest({ port, path, method = "GET", headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: HOST,
        port,
        path,
        method,
        headers,
        agent: false,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.once("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
      },
    );
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error("timeout")));
    req.once("error", reject);
    req.end(body);
  });
}

function requireOk(response, stage) {
  if (response.status < 200 || response.status >= 300) throw new Error(stage);
  return response;
}

function multipartWav(wav) {
  const boundary = "----silvia-local-voice-audit";
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic-audit.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
  );
  const suffix = Buffer.from(
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nde\r\n--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n--${boundary}--\r\n`,
  );
  return { boundary, body: Buffer.concat([prefix, wav, suffix]) };
}

async function run() {
  const sttHealth = requireOk(
    await localRequest({ port: PORTS.stt, path: PATHS.sttHealth }),
    "stt-health",
  );
  const ttsHealth = requireOk(
    await localRequest({ port: PORTS.tts, path: PATHS.ttsHealth }),
    "tts-health",
  );
  const ttsBody = Buffer.from(
    JSON.stringify({ input: SYNTHETIC_TEXT, voice: "ara", response_format: "wav" }),
  );
  const tts = requireOk(
    await localRequest({
      port: PORTS.tts,
      path: PATHS.tts,
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(ttsBody.byteLength) },
      body: ttsBody,
    }),
    "tts",
  );
  const wav = tts.body;
  if (wav.byteLength < 45 || wav.toString("ascii", 0, 4) !== "RIFF") throw new Error("tts-wav");

  const upload = multipartWav(wav);
  const stt = requireOk(
    await localRequest({
      port: PORTS.stt,
      path: PATHS.stt,
      method: "POST",
      headers: {
        "content-type": `multipart/form-data; boundary=${upload.boundary}`,
        "content-length": String(upload.body.byteLength),
      },
      body: upload.body,
    }),
    "stt",
  );
  let transcriptReceived = false;
  try {
    const value = JSON.parse(stt.body.toString("utf8"));
    transcriptReceived = typeof value?.text === "string" && value.text.trim().length > 0;
  } catch {
    throw new Error("stt-json");
  }
  if (!transcriptReceived) throw new Error("stt-transcript");

  console.log(JSON.stringify({
    ok: true,
    onlyLoopback: true,
    syntheticInput: true,
    health: { stt: sttHealth.status, tts: ttsHealth.status },
    tts: { status: tts.status, wav: true, audioBytes: wav.byteLength },
    stt: { status: stt.status, transcriptReceived },
  }));
}

run().catch((error) => {
  const stage = error instanceof Error && /^[a-z-]+$/.test(error.message)
    ? error.message
    : "transport";
  console.error(JSON.stringify({ ok: false, onlyLoopback: true, syntheticInput: true, stage }));
  process.exitCode = 1;
});
