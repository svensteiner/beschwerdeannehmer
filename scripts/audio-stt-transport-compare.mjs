#!/usr/bin/env node
/* Synthetische TTS-WAV: direktes STT gegen denselben Browser-Recorder. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import net from "node:net";
import { chromium } from "playwright";

const root = "C:\\silvia-voice",
  release = join(root, "whisper", "Release");
const python = "C:\\Python313\\python.exe",
  whisper = join(release, "whisper-server.exe");
const model = join(root, "models", "ggml-small.bin"),
  ffmpeg = join(release, "ffmpeg.exe");
const ports = { stt: 8278, tts: 8279, whisper: 8299 },
  children = [];
const dir = await mkdtemp(join(tmpdir(), "silvia-stt-compare-"));
for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"])
  delete process.env[key];
process.env.NODE_USE_ENV_PROXY = "0";
const env = {
  PATH: `${join(dir, "node_modules", ".bin")};${release}`,
  ...Object.fromEntries(
    [
      "SystemRoot",
      "ComSpec",
      "TEMP",
      "TMP",
      "USERPROFILE",
      "ProgramData",
      "APPDATA",
      "LOCALAPPDATA",
    ]
      .filter((k) => process.env[k])
      .map((k) => [k, process.env[k]]),
  ),
  DATABASE_URL: "",
  SILVIA_DATA_DIR: "memory",
  STT_PROVIDER: "lokal",
  WHISPER_UPSTREAM: `http://127.0.0.1:${ports.whisper}/inference`,
  NODE_USE_ENV_PROXY: "0",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} Timeout`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
function owned(file, args, options) {
  const child = spawn(file, args, { ...options, env, windowsHide: true });
  child.spawnError = null;
  child.once("error", (e) => {
    child.spawnError = e;
  });
  children.push(child);
  return child;
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.pid == null) return;
  const closed = new Promise((r) => child.once("close", r));
  child.kill("SIGTERM");
  await Promise.race([closed, sleep(3000)]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([closed, sleep(3000)]);
  }
}
async function fetchLocal(url, options = {}, timeout = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...options,
      redirect: "error",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
async function waitLocal(url, child) {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    if (child.spawnError) throw child.spawnError;
    if (child.exitCode !== null)
      throw new Error(`Dienst beendet (${child.exitCode})`);
    try {
      if ((await fetchLocal(url, {}, 1500)).ok) return;
    } catch { /* Dienst ist während des Hochlaufs noch nicht erreichbar. */ }
    await sleep(250);
  }
  throw new Error("Lokaler Dienst nicht bereit");
}
function portFree(port) {
  return new Promise((ok, fail) => {
    const s = net
      .createServer()
      .once("error", fail)
      .listen(port, "127.0.0.1", () => s.close(() => ok(true)));
  });
}
async function transcribe(bytes, filename) {
  const form = new FormData();
  const type = filename.endsWith(".wav")
    ? "audio/wav"
    : filename.endsWith(".mp4")
      ? "audio/mp4"
      : "audio/webm";
  form.append("file", new Blob([bytes], { type }), filename);
  form.append("language", "de");
  form.append("response_format", "json");
  const r = await fetchLocal(
    `http://127.0.0.1:${ports.stt}/v1/audio/transcriptions`,
    { method: "POST", body: form },
  );
  assert.equal(r.status, 200);
  return { status: r.status, body: await r.json() };
}
function wavStats(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    text = (p, n) => new TextDecoder().decode(bytes.subarray(p, p + n));
  assert.equal(text(0, 4), "RIFF");
  let p = 12,
    start = -1,
    size = 0,
    rate = 0,
    channels = 0,
    bits = 0;
  while (p + 8 <= v.byteLength) {
    const id = text(p, 4),
      n = v.getUint32(p + 4, true);
    if (id === "fmt ") {
      channels = v.getUint16(p + 10, true);
      rate = v.getUint32(p + 12, true);
      bits = v.getUint16(p + 22, true);
    }
    if (id === "data") {
      start = p + 8;
      size = n;
      break;
    }
    p += 8 + n + (n & 1);
  }
  assert.ok(start >= 0 && bits === 16);
  let sum = 0,
    peak = 0,
    clipped = 0,
    count = 0;
  for (let q = start; q + 1 < Math.min(v.byteLength, start + size); q += 2) {
    const x = Math.abs(v.getInt16(q, true)) / 32768;
    sum += x ** 2;
    peak = Math.max(peak, x);
    if (x >= 0.999) clipped++;
    count++;
  }
  return {
    duration_s: Number((count / Math.max(1, rate * channels)).toFixed(3)),
    peak: Number(peak.toFixed(4)),
    rms: Number(Math.sqrt(sum / Math.max(1, count)).toFixed(4)),
    clipping_ratio: Number((clipped / Math.max(1, count)).toFixed(6)),
  };
}
try {
  for (const port of Object.values(ports))
    assert.equal(await portFree(port), true, `Port ${port} ist belegt`);
  const wc = owned(
    whisper,
    [
      "-m",
      model,
      "-l",
      "de",
      "--host",
      "127.0.0.1",
      "--port",
      String(ports.whisper),
      "--convert",
      "-t",
      "4",
    ],
    { cwd: release, stdio: "ignore" },
  );
  const sc = owned(
    python,
    [
      "-m",
      "uvicorn",
      "stt_server:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(ports.stt),
    ],
    { cwd: root, stdio: "ignore" },
  );
  const tc = owned(
    python,
    [
      "-m",
      "uvicorn",
      "tts_server:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(ports.tts),
    ],
    { cwd: root, stdio: "ignore" },
  );
  await Promise.all([
    waitLocal(`http://127.0.0.1:${ports.stt}/health`, sc),
    waitLocal(`http://127.0.0.1:${ports.tts}/health`, tc),
    waitLocal(`http://127.0.0.1:${ports.whisper}/`, wc),
  ]);
  const wr = await fetchLocal(`http://127.0.0.1:${ports.tts}/v1/audio/speech`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: "Wie sind die Öffnungszeiten?",
      voice: "ara",
      response_format: "wav",
    }),
  });
  assert.equal(wr.status, 200);
  const wav = Buffer.from(await wr.arrayBuffer());
  const direct = await transcribe(wav, "synthetic-question.wav");
  let browser, recorded, mime;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const record = (limited) => withTimeout(
      page.evaluate(async ({ b64, limited }) => {
        const input = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const context = new AudioContext();
        let pageTimer;
        let stopTimer;
        try {
          const source = context.createBufferSource();
          source.buffer = await context.decodeAudioData(input.buffer);
          const gain = context.createGain();
          gain.gain.value = 4;
          const destination = context.createMediaStreamDestination();
          source.connect(gain);
          if (limited) {
            const compressor = context.createDynamicsCompressor();
            compressor.threshold.value = -6;
            compressor.knee.value = 0;
            compressor.ratio.value = 20;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.25;
            gain.connect(compressor);
            compressor.connect(destination);
          } else {
            gain.connect(destination);
          }
          const recorderMime = MediaRecorder.isTypeSupported(
            "audio/webm;codecs=opus",
          )
            ? "audio/webm;codecs=opus"
            : "audio/mp4";
          const recorder = new MediaRecorder(destination.stream, {
            mimeType: recorderMime,
          });
          const chunks = [];
          const done = new Promise((resolve, reject) => {
            let terminal = false;
            const finishError = (error) => {
              if (terminal) return;
              terminal = true;
              if (stopTimer) clearTimeout(stopTimer);
              reject(error);
            };
            recorder.ondataavailable = (event) => {
              if (event.data.size) chunks.push(event.data);
            };
            recorder.onerror = () =>
              finishError(new Error("MediaRecorder error"));
            source.onerror = () => finishError(new Error("Audio source error"));
            recorder.onstop = async () => {
              if (terminal) return;
              terminal = true;
              if (stopTimer) clearTimeout(stopTimer);
              resolve({
                bytes: Array.from(
                  new Uint8Array(
                    await new Blob(chunks, {
                      type: recorderMime,
                    }).arrayBuffer(),
                  ),
                ),
                mime: recorderMime,
              });
            };
            pageTimer = setTimeout(
              () => finishError(new Error("Browser recorder Timeout")),
              10_000,
            );
            recorder.start();
            source.onended = () => {
              stopTimer = setTimeout(() => {
                if (!terminal && recorder.state !== "inactive") recorder.stop();
              }, 150);
            };
            source.start();
          });
          return await done;
        } finally {
            if (pageTimer) clearTimeout(pageTimer);
            await context.close();
        }
      }, { b64: wav.toString("base64"), limited }),
      15_000,
      "page.evaluate",
    );
    recorded = await record(false);
    const limitedRecorded = await record(true);
    mime = recorded.mime;
    const limitedMime = limitedRecorded.mime;
    var limitedClip = Buffer.from(limitedRecorded.bytes);
    var limitedExt = limitedMime.includes("mp4") ? "mp4" : "webm";
    var limitedClipPath = join(dir, `limited.${limitedExt}`);
    var limitedClipWavPath = join(dir, "limited.wav");
    await writeFile(limitedClipPath, limitedClip);
    const limitedFfmpeg = owned(ffmpeg, ["-y", "-i", limitedClipPath, "-ac", "1", "-ar", "16000", limitedClipWavPath], { cwd: dir, stdio: "ignore" });
    await new Promise((resolve, reject) => {
      let limitedTimer = setTimeout(() => { limitedFfmpeg.kill("SIGKILL"); reject(new Error("ffmpeg Timeout")); }, 30_000);
      const finish = (error) => { clearTimeout(limitedTimer); if (error) reject(error); else resolve(); };
      limitedFfmpeg.once("close", (code) => finish(code === 0 ? null : new Error(`ffmpeg exit ${code}`)));
      limitedFfmpeg.once("error", finish);
    });
    var limitedWav = await readFile(limitedClipWavPath);
    var limitedResult = await transcribe(limitedClip, `limited-recorded.${limitedExt}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  const clip = Buffer.from(recorded.bytes),
    ext = mime.includes("mp4") ? "mp4" : "webm",
    clipPath = join(dir, `browser.${ext}`),
    clipWavPath = join(dir, "browser.wav");
  await writeFile(clipPath, clip);
  const fc = owned(
    ffmpeg,
    ["-y", "-i", clipPath, "-ac", "1", "-ar", "16000", clipWavPath],
    { cwd: dir, stdio: "ignore" },
  );
  let timer;
  await new Promise((ok, fail) => {
    const finish = (e) => {
      clearTimeout(timer);
      if (e) fail(e); else ok();
    };
    timer = setTimeout(() => {
      fc.kill("SIGKILL");
      finish(new Error("ffmpeg Timeout"));
    }, 30_000);
    fc.once("close", (n) =>
      finish(n === 0 ? null : new Error(`ffmpeg exit ${n}`)),
    );
    fc.once("error", (e) => finish(e));
  });
  const browserWav = await readFile(clipWavPath),
    browserResult = await transcribe(clip, `browser-recorded.${ext}`);
  const normalize = (text) =>
    text.normalize("NFKD").replace(/\W/g, "").toLowerCase();
  const expected = normalize("Wie sind die Öffnungszeiten?");
  const directText = direct.body?.text ?? "";
  const browserText = browserResult.body?.text ?? "";
  const limitedText = limitedResult.body?.text ?? "";
  const directMatchesExpected = normalize(directText) === expected;
  const browserMatchesExpected = normalize(browserText) === expected;
  const limitedMatchesExpected = normalize(limitedText) === expected;
  const match = normalize(directText) === normalize(browserText);
  console.log(
    JSON.stringify({
      scope: "synthetic-local-stt-transport-compare",
      comparisonComplete: true,
      normalizedTranscriptMatch: match,
      directMatchesExpected,
      browserMatchesExpected,
      limitedMatchesExpected,
      direct: {
        status: direct.status,
        transcript: directText,
        audio: wavStats(wav),
      },
      browser: {
        status: browserResult.status,
        transcript: browserText,
        audio: wavStats(browserWav),
      },
      limited: {
        status: limitedResult.status,
        transcript: limitedText,
        audio: wavStats(limitedWav),
      },
    }),
  );
  if (!match || !directMatchesExpected || !browserMatchesExpected || !limitedMatchesExpected)
    process.exitCode = 2;
} finally {
  const cleanupErrors = [];
  for (const child of children.reverse())
    await stop(child).catch((e) => cleanupErrors.push(e));
  for (const port of Object.values(ports))
    await portFree(port).catch((e) =>
      cleanupErrors.push(new Error(`Port ${port}: ${e.message}`)),
    );
  const actual = await realpath(dir).catch(() => null),
    base = resolve(tmpdir());
  if (
    actual &&
    actual !== base &&
    actual.toLowerCase().startsWith(`${base}\\`.toLowerCase())
  )
    await rm(actual, { recursive: true, force: true }).catch((e) =>
      cleanupErrors.push(e),
    );
  if (cleanupErrors.length) {
    console.error(`Cleanup: ${cleanupErrors.map((e) => e.message).join("; ")}`);
    process.exitCode ||= 1;
  }
}
