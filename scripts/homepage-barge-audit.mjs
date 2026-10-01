import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const base = process.env.AUDIT_URL;
const root = process.env.AUDIT_BUILD_ROOT;
assert(base && root, "Nur der isolierte Audit-Server ist erlaubt.");
const url = new URL(base);
assert.equal(url.protocol, "http:");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.notEqual(url.port, "8092");
const origin = url.origin;
const runtime = await readFile(join(root, ".output/server/index.mjs"), "utf8");
const names = new Map([...runtime.matchAll(/"([a-f0-9]{64})":\s*\{\s*functionName:\s*"([^"]+)"/g)].map(([, id, name]) => [id, name]));
assert([...names.values()].includes("speakAlma_createServerFn_handler"), "speakAlma fehlt im isolierten ServerFn-Manifest.");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
let speakCalls = 0;
let speakAborts = 0;
const releases = [];
context.on("requestfailed", (request) => {
  const id = new URL(request.url()).pathname.split("/").pop();
  if (names.get(id) === "speakAlma_createServerFn_handler" && /aborted/i.test(request.failure()?.errorText ?? "")) speakAborts += 1;
});

await context.addInitScript(() => {
  const audit = { loud: false, analyserReads: 0, analyserStreams: [], lastPolledAnalyserStreamId: null, gumCalls: 0, recorderStarts: 0, audios: [], unhandled: [] };
  window.__bargeAudit = audit;
  window.addEventListener("unhandledrejection", (event) => audit.unhandled.push(String(event.reason)));
  let nextStreamId = 0;
  const streams = [];
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
    getUserMedia: () => {
      const track = { readyState: "live", stops: 0, stop() { this.stops += 1; this.readyState = "ended"; } };
      const stream = { id: ++nextStreamId, getTracks: () => [track] };
      streams.push(stream);
      audit.gumCalls += 1;
      return Promise.resolve(stream);
    },
  } });
  const node = () => ({ connect() {} });
  class FakeAudioContext {
    createMediaStreamSource(stream) { this.stream = stream; return { ...node(), stream }; }
    createAnalyser() {
      const streamId = this.stream?.id ?? null;
      audit.analyserStreams.push(streamId);
      return {
        fftSize: 0,
        getFloatTimeDomainData(samples) {
          audit.analyserReads += 1;
          audit.lastPolledAnalyserStreamId = streamId;
          samples.fill(audit.loud ? 0.1 : 0);
        },
      };
    }
    createGain() { return { ...node(), gain: { value: 1 } }; }
    createDynamicsCompressor() {
      return { ...node(), threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 } };
    }
    createMediaStreamDestination() { return { stream: this.stream }; }
    close() { return Promise.resolve(); }
  }
  Object.defineProperty(window, "AudioContext", { configurable: true, value: FakeAudioContext });
  Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: undefined });
  class FakeRecorder {
    static isTypeSupported() { return true; }
    constructor(stream) { this.state = "inactive"; this.streamId = stream?.id; }
    start() { this.state = "recording"; audit.recorderStarts += 1; audit.recorderStreamId = this.streamId; }
    stop() { this.state = "inactive"; }
  }
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeRecorder });
  const NativeAudio = window.Audio;
  function TrackedAudio(...args) { const audio = new NativeAudio(...args); audit.audios.push(audio); return audio; }
  TrackedAudio.prototype = NativeAudio.prototype;
  Object.setPrototypeOf(TrackedAudio, NativeAudio);
  window.Audio = TrackedAudio;
});

await context.route("**/*", async (route) => {
  const request = route.request();
  const requestUrl = new URL(request.url());
  if (requestUrl.origin !== origin || !["GET", "POST"].includes(request.method())) return route.abort();
  if (request.method() !== "POST") return route.continue();
  const id = requestUrl.pathname.split("/").pop();
  if (names.get(id) !== "speakAlma_createServerFn_handler") return route.abort();
  speakCalls += 1;
  return new Promise((resolve) => releases.push(async () => {
    try {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { ok: true, audio: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAABAAgAZGF0YQAAAAA=" } }) });
    } catch {
      // Die absichtlich verspätete lokale Antwort darf den abgebrochenen Client nicht beleben.
    }
    resolve();
  }));
});

try {
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto(`${base}/#anrufen`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const button = document.querySelector("#sprechen-mode-anrufen");
    return Object.keys(button ?? {}).some((key) => key.startsWith("__reactProps$"));
  });
  await page.locator("#sprechen-mode-anrufen").click();
  await page.locator("#sprechen-anrufen").click();
  await page.waitForTimeout(2_400);
  const started = await page.evaluate(() => ({ ...window.__bargeAudit }));
  assert.equal(speakCalls, 1, `Die gehängte TTS-Anfrage startete nicht: ${JSON.stringify(started)}`);
  assert.ok(started.gumCalls >= 1, `Der Barge-Mikrofonpfad startete nicht: ${JSON.stringify(started)}`);
  assert.ok(started.analyserReads > 0, `Der Barge-Analyser startete nicht: ${JSON.stringify(started)}`);
  await page.waitForTimeout(750);
  const silent = await page.evaluate(() => ({ analyserReads: window.__bargeAudit.analyserReads, activeBargeStreamId: window.__bargeAudit.lastPolledAnalyserStreamId, gumCalls: window.__bargeAudit.gumCalls, recorderStarts: window.__bargeAudit.recorderStarts }));
  assert.equal(speakAborts, 0, "Stille brach den TTS-Request vorzeitig ab.");
  assert.equal(silent.recorderStarts, 0, "Stille startete fälschlich eine Mikrofonaufnahme.");
  assert.ok(silent.analyserReads > 0, "Der echte RAF-/Analyser-Pfad wurde nicht abgefragt.");
  assert.ok(Number.isInteger(silent.activeBargeStreamId), "Der aktive Barge-Analyser besitzt keinen Stream.");
  await page.evaluate(() => { window.__bargeAudit.loud = true; });
  await page.waitForFunction(() => window.__bargeAudit.recorderStarts === 1, null, { timeout: 2_500 });
  await page.waitForTimeout(100);
  assert.equal(speakAborts, 1, "Das laute Signal brach den hängenden TTS-Request nicht ab.");
  const loud = await page.evaluate(() => ({ analyserReads: window.__bargeAudit.analyserReads, gumCalls: window.__bargeAudit.gumCalls, recorderStarts: window.__bargeAudit.recorderStarts, recorderStreamId: window.__bargeAudit.recorderStreamId }));
  assert.equal(loud.gumCalls, silent.gumCalls, "Die Aufnahme holte statt des Barge-Streams ein neues Mikrofon.");
  assert.equal(loud.recorderStreamId, silent.activeBargeStreamId, "Die Aufnahme erhielt nicht genau den aktiven Barge-Stream.");
  assert.ok(loud.analyserReads > silent.analyserReads, "Nach dem lauten Signal wurde der Analyser nicht weiter gepollt.");
  const audiosBeforeLateResponse = await page.evaluate(() => window.__bargeAudit.audios.length);
  await Promise.all(releases.splice(0).map((release) => release()));
  await page.waitForTimeout(100);
  const late = await page.evaluate(() => ({ audios: window.__bargeAudit.audios.length, unhandled: window.__bargeAudit.unhandled }));
  assert.equal(late.audios, audiosBeforeLateResponse, "Eine verspätete TTS-Antwort startete trotz Barge Audio.");
  assert.deepEqual(late.unhandled, [], `Der Barge-Abbruch erzeugte eine unbehandelte Promise: ${JSON.stringify(late.unhandled)}`);
  assert.deepEqual(browserErrors, [], `Unerwartete Browserfehler: ${browserErrors.join(" | ")}`);
  const result = { ok: true, timer: "normal-35000ms", silent, loud, speakCalls, speakAborts, lateAudioCount: late.audios, unhandledRejections: late.unhandled.length, browserErrors };
  await writeFile(join("artifacts", "homepage-barge-audit.json"), `${JSON.stringify(result)}\n`);
  console.log(JSON.stringify(result));
} finally {
  await context.close();
  await browser.close();
}
