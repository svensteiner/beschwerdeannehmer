#!/usr/bin/env node
/* Isolated browser proof: synthetic local audio -> app STT -> app answer -> local TTS. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { createServer } from "node:net";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { chromium } from "playwright";

const tempRoot = resolve(process.argv[2] ?? "");
assert(tempRoot, "isolierter Temp-Root als erstes Argument erforderlich");
const tempBase = resolve(tmpdir());
assert(tempRoot.startsWith(`${tempBase}\\silvia-home-audit-`), "Temp-Root außerhalb des erlaubten Bereichs");
assert((await realpath(tempRoot)).toLowerCase() === tempRoot.toLowerCase());
const appPort = 8097;
const ports = [8178, 8179, 8199];
const base = `http://127.0.0.1:${appPort}`;
const voiceRoot = "C:\\silvia-voice";
const python = "C:\\Python313\\python.exe";
const whisper = "C:\\silvia-voice\\whisper\\Release\\whisper-server.exe";
const model = "C:\\silvia-voice\\models\\ggml-small.bin";
const processes = [];
let sttServiceRequests = 0;
const free = (port) => new Promise((resolvePort) => { const s = createServer(); s.once("error", () => resolvePort(false)); s.listen(port, "127.0.0.1", () => s.close(() => resolvePort(true))); });
const env = (extra = {}) => ({ PATH: `${tempRoot}\\node_modules\\.bin;C:\\silvia-voice\\whisper\\Release;${process.env.PATH ?? ""}`, SystemRoot: process.env.SystemRoot ?? "C:\\Windows", ComSpec: process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe", TEMP: process.env.TEMP ?? tempBase, TMP: process.env.TMP ?? tempBase, USERPROFILE: process.env.USERPROFILE ?? tempBase, APPDATA: process.env.APPDATA ?? "", LOCALAPPDATA: process.env.LOCALAPPDATA ?? "", VITE_AUTH_ENABLED: "false", DATABASE_URL: "", SILVIA_DATA_DIR: "memory", SILVIA_LIVE_DEMO_ENABLED: "0", SILVIA_LLM_PROVIDER: "compat", SILVIA_LLM_BASE_URL: "http://127.0.0.1:11435/v1", SILVIA_STT_URL: "http://127.0.0.1:8178/v1/audio/transcriptions", SILVIA_TTS_URL: "http://127.0.0.1:8179/v1/audio/speech", PIPER_EXE: "C:\\silvia-voice\\.venv-piper\\Scripts\\piper.exe", PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", XAI_API_KEY: "", HTTP_PROXY: "", HTTPS_PROXY: "", ALL_PROXY: "", NODE_USE_ENV_PROXY: "0", OLLAMA_NO_CLOUD: "1", ...extra });
function spawnOwned(file, args, options) {
  const child = spawn(file, args, options);
  child.once("error", (error) => { child.spawnError = error; });
  processes.push(child);
  return child;
}
function httpPost(port, path, body) { return new Promise((resolvePost, reject) => { const req = request({ host: "127.0.0.1", port, path, method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }, agent: false }, (res) => { const chunks = []; res.on("data", (x) => chunks.push(x)); res.on("end", () => resolvePost({ status: res.statusCode, body: Buffer.concat(chunks) })); }); req.setTimeout(30_000, () => { req.destroy(new Error("local audio POST timeout")); }); req.on("error", reject); req.end(body); }); }
async function ready(port, path, limit = 45_000) { const until = Date.now() + limit; while (Date.now() < until) { const failed = processes.find((p) => p.spawnError); if (failed) throw new Error(`eigener Sprachprozess konnte nicht starten: ${failed.spawnError.message}`); const dead = processes.find((p) => p.exitCode !== null || p.signalCode !== null); if (dead) throw new Error(`eigener Sprachprozess vorzeitig beendet exit=${dead.exitCode} signal=${dead.signalCode}`); try { const result = await new Promise((ok, no) => { const r = request({ host: "127.0.0.1", port, path, agent: false }, (res) => { res.resume(); res.on("end", () => ok(res.statusCode)); }); r.on("error", no); r.setTimeout(2_000, () => { r.destroy(); no(new Error("timeout")); }); r.end(); }); if (result === 200) return; } catch { /* Dienst ist während des Hochlaufs noch nicht erreichbar. */ } await new Promise((r) => setTimeout(r, 250)); } throw new Error(`Dienst nicht bereit ${port}${path}`); }
async function stop(p) { if (!p || p.spawnError || p.pid == null || p.exitCode !== null || p.signalCode !== null) return; p.kill("SIGTERM"); let until = Date.now() + 8_000; while (p.exitCode === null && p.signalCode === null && Date.now() < until) await new Promise((r) => setTimeout(r, 100)); if (p.exitCode === null && p.signalCode === null) { p.kill("SIGKILL"); until = Date.now() + 5_000; while (p.exitCode === null && p.signalCode === null && Date.now() < until) await new Promise((r) => setTimeout(r, 100)); } if (p.exitCode === null && p.signalCode === null) throw new Error("eigener Audioprozess beendet sich nicht"); }

for (const port of [appPort, ...ports]) assert(await free(port), `Port ${port} ist belegt`);
let browser;
try {
  const e = env({ SILVIA_LIVE_DEMO_ENABLED: "0", WHISPER_UPSTREAM: "http://127.0.0.1:8199/inference" });
  spawnOwned(whisper, ["-m", model, "-l", "de", "--host", "127.0.0.1", "--port", "8199", "--convert", "-t", "4"], { cwd: "C:\\silvia-voice\\whisper\\Release", env: e, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  spawnOwned(python, ["-m", "uvicorn", "stt_server:app", "--host", "127.0.0.1", "--port", "8178"], { cwd: voiceRoot, env: e, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  spawnOwned(python, ["-m", "uvicorn", "tts_server:app", "--host", "127.0.0.1", "--port", "8179"], { cwd: voiceRoot, env: e, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  for (const p of processes) { p.stdout?.on("data", (chunk) => { const text = String(chunk); if (text.includes("/v1/audio/transcriptions")) sttServiceRequests += 1; process.stderr.write(text); }); p.stderr?.on("data", (chunk) => { const text = String(chunk); if (text.includes("/v1/audio/transcriptions")) sttServiceRequests += 1; process.stderr.write(text); }); }
  await ready(8178, "/health"); await ready(8179, "/health"); await ready(8199, "/health", 90_000);
  const inputAudio = await httpPost(8179, "/v1/audio/speech", JSON.stringify({ input: "Wie sind die Öffnungszeiten?", voice: "ara", response_format: "wav" }));
  assert.equal(inputAudio.status, 200, "lokales TTS konnte synthetische Frage nicht erzeugen");
  spawnOwned(process.execPath, [join(tempRoot, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(appPort)], { cwd: tempRoot, env: env(), windowsHide: true, stdio: "ignore" }); await ready(appPort, "/");
  browser = await chromium.launch({ headless: true, args: ["--use-fake-ui-for-media-stream"] }); const context = await browser.newContext(); let external = 0;
  const questionWavBase64 = inputAudio.body.toString("base64");
  await context.addInitScript(({ wavBase64 }) => {
    const audit = { created: 0, endedIds: [], events: [], snapshots: {}, waitForUserMark: null };
    Object.defineProperty(window, "__audioAudit", { value: audit });
    const liveSnapshots = [];
    audit.capture = () => liveSnapshots.map((capture) => capture());
    const NativeAudio = window.Audio;
    window.Audio = function (...args) {
      const item = new NativeAudio(...args);
      const index = audit.created++;
      liveSnapshots.push(() => ({ index, duration: Number.isFinite(item.duration) ? item.duration : null, currentTime: item.currentTime, paused: item.paused, ended: item.ended, readyState: item.readyState, networkState: item.networkState }));
      const record = (event) => {
        const value = (number) => Number.isFinite(number) ? number : null;
        const snapshot = { index, event, duration: value(item.duration), currentTime: value(item.currentTime), paused: item.paused, readyState: item.readyState };
        audit.events.push(snapshot);
        audit.snapshots[index] = snapshot;
        if (event === "ended") audit.endedIds.push(index);
      };
      record("created");
      for (const event of ["loadedmetadata", "canplay", "play", "playing", "waiting", "pause", "ended", "error"]) item.addEventListener(event, () => record(event));
      const nativePlay = item.play.bind(item);
      item.play = (...playArgs) => {
        try {
          const result = nativePlay(...playArgs);
          Promise.resolve(result).then(() => record("play-resolved"), () => record("play-rejected"));
          return result;
        } catch (error) {
          record("play-rejected");
          throw error;
        }
      };
      return item;
    };
    window.Audio.prototype = NativeAudio.prototype;

    const streamOwners = new WeakMap();
    const nodeOwners = new WeakMap();
    const bytes = Uint8Array.from(atob(wavBase64), (char) => char.charCodeAt(0));
    const NativeAudioContext = window.AudioContext;
    const nativeSource = NativeAudioContext.prototype.createMediaStreamSource;
    const nativeDestination = NativeAudioContext.prototype.createMediaStreamDestination;
    const nativeConnect = AudioNode.prototype.connect;
    NativeAudioContext.prototype.createMediaStreamSource = function (stream) {
      const node = nativeSource.call(this, stream);
      const owner = streamOwners.get(stream);
      if (owner) nodeOwners.set(node, owner);
      return node;
    };
    NativeAudioContext.prototype.createMediaStreamDestination = function () {
      const node = nativeDestination.call(this);
      return node;
    };
    AudioNode.prototype.connect = function (destination, ...rest) {
      const result = nativeConnect.call(this, destination, ...rest);
      const owner = nodeOwners.get(this);
      if (owner && destination && typeof destination === "object") {
        nodeOwners.set(destination, owner);
        if (destination.stream) streamOwners.set(destination.stream, owner);
      }
      return result;
    };
    const NativeRecorder = window.MediaRecorder;
    window.MediaRecorder = class AuditRecorder extends NativeRecorder {
      constructor(stream, options) {
        super(stream, options);
        this.__syntheticOwner = streamOwners.get(stream);
      }
      start(...args) {
        super.start(...args);
        this.__syntheticOwner?.start();
      }
    };
    let questionStarted = false;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (!constraints?.audio) throw new Error("Only synthetic audio is allowed");
      const context = new NativeAudioContext();
      const destination = context.createMediaStreamDestination();
      const buffer = await context.decodeAudioData(bytes.buffer.slice(0));
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = false;
      source.connect(destination);
      const owner = { start() { if (questionStarted) return; questionStarted = true; void context.resume(); source.start(0); } };
      streamOwners.set(destination.stream, owner);
      return destination.stream;
    };
    const userCount = () => document.querySelectorAll('[data-line-role="user"]').length;
    const baseline = userCount();
    audit.userMark = null;
    {
      const observer = new MutationObserver(() => {
        const count = userCount();
        if (count > baseline) {
          observer.disconnect();
          audit.userMark = { created: audit.created, assistants: document.querySelectorAll('[data-line-role="assistant"]').length };
        }
      });
      observer.observe(document, { childList: true, subtree: true, characterData: true });
    }
  }, { wavBase64: questionWavBase64 });
  await context.route("**/*", (route) => { if (new URL(route.request().url()).origin !== base) { external += 1; return route.abort(); } return route.continue(); });
  const page = await context.newPage(); const posts = []; page.on("request", (r) => { if (r.method() === "POST") posts.push({ path: new URL(r.url()).pathname, body: r.postData() ?? "" }); });
  await page.goto(`${base}/sprechen?test=ja`, { waitUntil: "commit" }); await page.waitForTimeout(8_000);
  const beforeUsers = await page.locator('[data-line-role="user"]').count(); const beforeAssistant = await page.locator('[data-line-role="assistant"]').count();
  await page.locator("#sprechen-anrufen").click();
  await page.waitForFunction(() => window.__audioAudit.userMark !== null, null, { timeout: 90_000 });
  const answerAudioMark = await page.evaluate(() => window.__audioAudit.userMark);
  await page.waitForFunction(({ users, assistant }) => document.querySelectorAll('[data-line-role="user"]').length > users && document.querySelectorAll('[data-line-role="assistant"]').length > assistant, { users: beforeUsers, assistant: beforeAssistant }, { timeout: 90_000 });
  const transcript = await page.locator('[data-line-role="user"]').last().innerText(); await page.waitForFunction((n) => document.querySelectorAll('[data-line-role="assistant"]').length > n, answerAudioMark.assistants, { timeout: 60_000 }); const answer = await page.locator('[data-line-role="assistant"]').last().innerText();
  const sttPosts = posts.filter((item) => /"audio"\s*:\s*"[A-Za-z0-9+/=]{200,}"/.test(item.body)); const sttPostObserved = sttPosts.length > 0 || sttServiceRequests > 0; assert(sttPostObserved, `kein nachgewiesener STT-Transport: appAudioPosts=${sttPosts.length} serviceRequests=${sttServiceRequests}`);
  console.log(JSON.stringify({ phase: "recognized-and-answered", transcript, answer, answerAudioMark, sttServiceRequests }));
  try {
    await page.waitForFunction((mark) => {
      const audit = window.__audioAudit;
      const active = /Silvia (spricht|notiert)/i.test(document.body.innerText);
      const answerIds = [...Array(Math.max(0, audit.created - mark.created)).keys()].map((offset) => mark.created + offset);
      return !active && answerIds.length > 0 && answerIds.every((index) => audit.endedIds.includes(index));
    }, answerAudioMark, { timeout: 120_000 });
  } catch (error) {
    console.log(JSON.stringify({ phase: "audio-failure", audio: await page.evaluate(() => ({ created: window.__audioAudit.created, events: window.__audioAudit.events, snapshots: window.__audioAudit.capture() })) }));
    throw error;
  }
  const audioResult = await page.evaluate((mark) => ({ createdAfterUser: window.__audioAudit.created - mark.created, endedAfterUser: window.__audioAudit.endedIds.filter((index) => index >= mark.created), events: window.__audioAudit.events.filter((event) => event.index >= mark.created) }), answerAudioMark);
  const normalizedTranscript = transcript.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const transcriptAccepted = /\bwie\s+sind\b[^.!?]{0,80}\boffnungs?zeiten\b|\bwelche\s+zeiten\b|\bwann\s+(?:habt|seid)\s+ihr\s+offen\b|\bhabt\s+ihr\s+offen\b/.test(normalizedTranscript);
  const answerAccepted = /Unsere Zeiten:\s*[^.]+\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}/i.test(answer) && /Jetzt:/i.test(answer);
  const answerAudioProven = audioResult.endedAfterUser.length > 0;
  const qualityAccepted = transcriptAccepted && answerAccepted && answerAudioProven;
  console.log(JSON.stringify({ ok: false, scope: "synthetic-audio-app-diagnostic", qualityAccepted, transcriptAccepted, answerAccepted, answerAudioProven, transcript, answer, sttPostObserved, sttServiceRequests, sttPostPaths: sttPosts.map((item) => item.path), audioResult, externalBlocked: external }));
  process.exitCode = 2;
  await context.close();
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const p of processes.reverse()) {
    try { await stop(p); } catch (error) { process.stderr.write(`Cleanup-Warnung: ${error instanceof Error ? error.message : String(error)}\n`); }
  }
  for (const port of [appPort, ...ports]) {
    try { assert(await free(port), `Port ${port} nach Cleanup belegt`); } catch (error) { process.stderr.write(`Port-Cleanup-Warnung: ${error instanceof Error ? error.message : String(error)}\n`); }
  }
}
