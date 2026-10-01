#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright";

const suppliedTempRoot = process.env.HOME_AUDIO_AUDIT_TEMP_ROOT || process.argv[2];
assert(suppliedTempRoot, "Temp-Buildpfad erforderlich: HOME_AUDIO_AUDIT_TEMP_ROOT oder erstes Argument");
const tempRoot = resolve(suppliedTempRoot);
const tempBase = resolve(tmpdir());
assert(tempRoot.startsWith(`${tempBase}\\silvia-home-audit-`), `Unsicherer Temp-Buildpfad: ${tempRoot}`);
assert(!tempRoot.toLowerCase().startsWith("c:\\silvia\\"), "Original-Workspace darf nie als Audit-CWD dienen");
assert((await realpath(tempRoot)).toLowerCase() === tempRoot.toLowerCase(), "Temp-Buildpfad ist ein Symlink/Junction");
const serverIndex = `${tempRoot}\\.output\\server\\index.mjs`;
assert((await lstat(serverIndex)).isFile() && (await realpath(serverIndex)).toLowerCase() === serverIndex.toLowerCase(), "Temp-Serverindex ist kein echter lokaler Buildbestandteil");
const voiceRoot = "C:\\silvia-voice";
const host = "127.0.0.1";
const ports = { app: 8094, tts: 8179 };
const base = `http://${host}:${ports.app}`;

function env(extra = {}) {
  const names = ["PATH", "SystemRoot", "ComSpec", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "ProgramData"];
  const out = Object.fromEntries(names.filter((n) => typeof process.env[n] === "string").map((n) => [n, process.env[n]]));
  out.PATH = `${tempRoot}\\node_modules\\.bin;${out.PATH ?? ""}`;
  Object.assign(out, { SILVIA_LLM_PROVIDER: "compat", SILVIA_LLM_BASE_URL: "http://127.0.0.1:11435/v1", SILVIA_TTS_URL: `http://${host}:${ports.tts}/v1/audio/speech`, OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", XAI_API_KEY: "", DATABASE_URL: "", SILVIA_DATA_DIR: "memory", SILVIA_LIVE_DEMO_ENABLED: "0", NODE_USE_ENV_PROXY: "0", HTTP_PROXY: "", HTTPS_PROXY: "", ALL_PROXY: "", VITE_AUTH_ENABLED: "false", HOST: host, PORT: String(ports.app), ...extra });
  return out;
}
function free(port) { return new Promise((resolve) => { const s = createServer(); s.once("error", () => resolve(false)); s.listen(port, host, () => s.close(() => resolve(true))); }); }
function get(port, path) { return new Promise((resolve, reject) => { const req = httpRequest({ host, port, path, method: "GET", agent: false }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); }); req.setTimeout(3_000, () => { req.destroy(); reject(new Error("health timeout")); }); req.on("error", reject); req.end(); }); }
async function ready(port, path, processes) { const until = Date.now() + 30_000; while (Date.now() < until) { if (processes.some((p) => p.spawnError)) throw processes.find((p) => p.spawnError).spawnError; if (processes.some((p) => p.exitCode !== null || p.signalCode !== null)) throw new Error("lokaler Audioprozess vorzeitig beendet"); try { if ((await get(port, path)) === 200) return; } catch { /* Dienst ist während des Hochlaufs noch nicht erreichbar. */ } await new Promise((r) => setTimeout(r, 250)); } throw new Error(`Audio-Dienst nicht bereit: ${port}${path}`); }
function awaitExit(p, timeoutMs = 4_000) {
  if (p.exitCode !== null || p.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let timer;
    const onExit = () => {
      clearTimeout(timer);
      p.off("exit", onExit);
      resolve(true);
    };
    p.once("exit", onExit);
    timer = setTimeout(() => {
      p.off("exit", onExit);
      resolve(false);
    }, timeoutMs);
  });
}
async function stop(p) {
  if (p.exitCode !== null || p.signalCode !== null || p.spawnError) return;
  const stopped = awaitExit(p);
  p.kill("SIGTERM");
  if (await stopped) return;
  const killed = awaitExit(p);
  p.kill("SIGKILL");
  assert(await killed, "Audioprozess läuft weiter");
}

for (const port of Object.values(ports)) assert(await free(port), `Port ${port} belegt`);
await mkdir("C:\\silvia\\artifacts", { recursive: true });
const serviceEnv = env({ OLLAMA_NO_CLOUD: "1" });
const processes = [];
const logs = [];
let browser;
try {
  const ttsProcess = spawn("C:\\Python313\\python.exe", ["-m", "uvicorn", "tts_server:app", "--host", host, "--port", String(ports.tts)], { cwd: voiceRoot, env: serviceEnv, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  ttsProcess.once("error", (error) => { ttsProcess.spawnError = error; });
  processes.push(ttsProcess);
  for (const p of processes) { p.stdout?.on("data", (x) => logs.push(String(x))); p.stderr?.on("data", (x) => logs.push(String(x))); }
  await ready(ports.tts, "/health", processes);
  const app = spawn(process.execPath, [`${tempRoot}\\.output\\server\\index.mjs`], { cwd: tempRoot, env: env(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  app.once("error", (error) => { app.spawnError = error; });
  processes.push(app); app.stdout.on("data", (x) => logs.push(String(x))); app.stderr.on("data", (x) => logs.push(String(x)));
  await ready(ports.app, "/", processes);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(); let blockedExternal = 0;
  await context.addInitScript(() => {
    const audit = { audios: [], objectBytes: [], ended: 0, endedIds: [], errors: 0, events: [], playRejects: [], playResolved: [] };
    Object.defineProperty(window, "__audioAudit", { value: audit, configurable: false, writable: false });
    const nativeCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (value) => { if (value instanceof Blob) audit.objectBytes.push(value.size); return nativeCreateObjectURL(value); };
    const NativeAudio = window.Audio;
    window.Audio = function (...args) { const audio = new NativeAudio(...args); const index = audit.audios.push(audio) - 1; const measure = (event) => { const src = String(audio.currentSrc || audio.src || ""); const data = src.startsWith("data:") ? src.slice(src.indexOf(",") + 1) : ""; audit.events.push({ index, event, dataUriBytes: data ? Math.floor(data.replace(/=+$/, "").length * 3 / 4) : 0, readyState: audio.readyState, networkState: audio.networkState, duration: audio.duration, currentTime: audio.currentTime, paused: audio.paused, ended: audio.ended, srcType: src.split(":", 1)[0] }); }; audio.addEventListener("loadedmetadata", () => measure("loadedmetadata")); audio.addEventListener("canplay", () => measure("canplay")); audio.addEventListener("ended", () => { audit.ended += 1; audit.endedIds.push(index); measure("ended"); }); audio.addEventListener("error", () => { audit.errors += 1; measure(`error:${audio.error?.code ?? "unknown"}:${audio.error?.message ?? ""}`); }); const play = audio.play.bind(audio); audio.play = () => { const result = play(); result?.then(() => audit.playResolved.push(index)).catch((error) => audit.playRejects.push({ index, name: String(error?.name || error) })); return result; }; return audio; };
    window.Audio.prototype = NativeAudio.prototype;
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("synthetic audit microphone denied", "NotAllowedError"); };
  });
  await context.route("**/*", (route) => { const req = route.request(); const url = new URL(req.url()); if (url.origin !== base) { blockedExternal += 1; return route.abort(); } return route.continue(); });
  const page = await context.newPage(); const consoleErrors = []; const pageErrors = []; const httpEvents = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  page.on("response", (response) => { const url = new URL(response.url()); if (url.origin === base && response.status() >= 400) httpEvents.push(`${response.request().method()} ${url.pathname} ${response.status()}`); });
  page.on("requestfinished", (request) => { if (request.method() === "POST") httpEvents.push(`${request.url()} ${request.method()} finished`); });
  page.on("requestfailed", (request) => { if (request.method() === "POST") httpEvents.push(`${request.url()} ${request.method()} failed`); });
  await page.goto(`${base}/#anrufen`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.locator("#anrufen #sprechen-mode-trainieren").waitFor({ timeout: 15_000 });
  await page.locator("#anrufen #sprechen-mode-trainieren").click();
  await page.locator("#anrufen #sprechen-mode-anrufen").click();
  assert.equal(await page.locator("#anrufen #sprechen-mode-anrufen").isEnabled(), true, "React-Anrufmodus wurde nicht hydratisiert");
  assert.equal(await page.locator("#anrufen #sprechen-mode-trainieren span").count(), 0, "Modusumschaltung wurde nicht verarbeitet");
  await page.locator("#anrufen #sprechen-anrufen").click();
  await page.waitForTimeout(4_000);
  const phaseText = await page.locator("#anrufen").innerText().catch(() => "");
  if (!(await page.locator("#anrufen input").count())) {
    await page.screenshot({ path: "C:\\silvia\\artifacts\\home-audio-diagnostic-failure.png", fullPage: false });
    throw new Error(`Gespräch wurde nicht live: ${JSON.stringify({ phaseText, consoleErrors, pageErrors, httpEvents })}`);
  }
  const input = page.locator("#anrufen input").first(); await input.waitFor({ timeout: 10_000 });
  const question = "Wie sind die Öffnungszeiten?";
  const audioMark = await page.evaluate(() => ({ audios: window.__audioAudit.audios.length, objectBytes: window.__audioAudit.objectBytes.length }));
  const userBefore = await page.locator('#anrufen [data-line-role="user"]').count();
  const assistantBefore = await page.locator('#anrufen [data-line-role="assistant"]').count();
  await input.fill(question);
  await page.getByRole("button", { name: "Senden", exact: true }).click();
  await page.waitForFunction(({ userCount, assistantCount }) => document.querySelectorAll('#anrufen [data-line-role="user"]').length > userCount && document.querySelectorAll('#anrufen [data-line-role="assistant"]').length > assistantCount, { userCount: userBefore, assistantCount: assistantBefore }, { timeout: 30_000 });
  const transcript = await page.locator('#anrufen [data-line-role="user"]').last().innerText();
  console.log(JSON.stringify({ phase: "typed-conversation", browserTranscript: transcript, httpEvents, consoleErrors, pageErrors }));
  const assistant = await page.locator('#anrufen [data-line-role="assistant"]').last().innerText();
  assert.match(assistant, /(Zeiten|Montag|geschlossen)/i, "lokale Antwort ohne Zeitbezug");
  console.log(JSON.stringify({ phase: "before-audio-assert", transcript, assistant, audioMark, consoleErrors, pageErrors, httpEvents }));
  let audioWaitError = null;
  try {
    await page.waitForFunction(({ mark }) => {
      const audit = window.__audioAudit;
      const answer = audit?.audios?.map((_, index) => index).filter((index) => index >= mark.audios) ?? [];
      const ended = answer.length > 0 && answer.every((index) => audit.endedIds.includes(index));
      const error = audit?.events?.some((event) => event.index >= mark.audios && String(event.event).startsWith("error:"))
        || audit?.playRejects?.some((event) => event.index >= mark.audios);
      const text = document.querySelector("#anrufen")?.textContent || "";
      return (ended && text.includes("Verbunden") && !text.includes("Silvia spricht") && !text.includes("Silvia notiert")) || error;
    }, { mark: audioMark }, { timeout: 120_000 });
    await page.waitForFunction(({ mark }) => { const a = window.__audioAudit; const answer = a?.audios?.map((_, index) => index).filter((index) => index >= mark.audios) ?? []; const ended = answer.length > 0 && answer.every((index) => a.endedIds.includes(index)); const error = a?.events?.some((event) => event.index >= mark.audios && String(event.event).startsWith("error:")) || a?.playRejects?.some((event) => event.index >= mark.audios); const text = document.querySelector("#anrufen")?.textContent || ""; return (ended && text.includes("Verbunden") && !text.includes("Silvia spricht") && !text.includes("Silvia notiert")) || error; }, { mark: audioMark }, { timeout: 120_000 });
  } catch (error) { audioWaitError = error.name; }
  const browserAudio = await page.evaluate(({ mark }) => { const audit = window.__audioAudit; if (!audit || !Array.isArray(audit.audios) || !Array.isArray(audit.events) || !Array.isArray(audit.endedIds) || !Array.isArray(audit.playRejects)) return null; const answer = audit.audios.slice(mark.audios)[0]; const events = audit.events.filter((event) => event.index >= mark.audios); return { audios: audit.audios.slice(mark.audios).length, ended: audit.endedIds.some((index) => index >= mark.audios), errors: events.filter((event) => String(event.event).startsWith("error:")).length, answerBytes: events.reduce((n, event) => Math.max(n, event.dataUriBytes), 0), events, playResolved: audit.playResolved.filter((index) => index >= mark.audios), playRejects: audit.playRejects.filter((event) => event.index >= mark.audios), dataUri: answer?.src?.startsWith("data:") ? answer.src : "" }; }, { mark: audioMark });
  if (browserAudio?.dataUri) { const encoded = browserAudio.dataUri.slice(browserAudio.dataUri.indexOf(",") + 1); await writeFile("C:\\silvia\\artifacts\\home-audio-answer.data", Buffer.from(encoded, "base64")); delete browserAudio.dataUri; }
  console.log(JSON.stringify({ phase: "answer-audio-result", audioWaitError, browserAudio, httpEvents, consoleErrors, pageErrors }));
  assert.equal(audioWaitError, null, "Antwortaudio nicht innerhalb der Testfrist beendet");
  assert(browserAudio && browserAudio.ended, "kein Antwort-Audio-Ende");
  assert(browserAudio && browserAudio.answerBytes > 200, "keine nachgewiesenen Antwort-Audiodaten");
  assert.equal(browserAudio.errors, 0, "Antwortaudio meldet einen Wiedergabefehler");
  assert.equal(browserAudio.playRejects.length, 0, "Start des Antwortaudios abgelehnt");
  console.log(JSON.stringify({ ok: true, scope: "typed-question/local-tts", sttTested: false, microphone: "NotAllowedError", transcript, assistantResponseVisible: true, assistantTimeRelated: true, browserAudio, blockedExternal }, null, 2));
  await context.close();
} finally { await browser?.close().catch(() => {}); for (const p of processes.reverse()) await stop(p); for (const port of Object.values(ports)) assert(await free(port), `Port ${port} nach Cleanup belegt`); }
