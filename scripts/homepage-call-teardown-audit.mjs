import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { defaultSerovalPlugins } from "@tanstack/router-core";
import { fromJSON } from "seroval";

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
assert([...names.values()].includes("transcribeAlma_createServerFn_handler"), "transcribeAlma fehlt im isolierten ServerFn-Manifest.");
assert([...names.values()].includes("askAlma_createServerFn_handler"), "askAlma fehlt im isolierten ServerFn-Manifest.");
function ttsTextFromRequest(body) {
  const decoded = fromJSON(JSON.parse(body), { plugins: defaultSerovalPlugins });
  assert.equal(typeof decoded?.data?.text, "string", "TTS-Anfrage ohne Text.");
  return decoded.data.text;
}
function localWav(seconds = 4) {
  const rate = 8_000;
  const samples = Buffer.alloc(rate * seconds);
  for (let i = 0; i < samples.length; i += 1) samples[i] = 128 + Math.round(20 * Math.sin((i / rate) * Math.PI * 2 * 440));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + samples.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28); header.writeUInt16LE(1, 32); header.writeUInt16LE(8, 34); header.write("data", 36); header.writeUInt32LE(samples.length, 40);
  return `data:audio/wav;base64,${Buffer.concat([header, samples]).toString("base64")}`;
}
const LOCAL_WAV = localWav();
const LOCAL_ACTION = {
  type: "none",
  owner: "Klientel",
  pet: "Patient",
  kind: "Anliegen",
  concern: "",
  summary: "",
};
const PREFETCH_GREETING_FACT = "Bei der Begrüßung sagen Sie: Willkommen, ich bin Silvia am Empfang und unterstütze Sie bei Ihrem Anliegen ruhig und zuverlässig. Bitte nennen Sie für den Datenabgleich Ihren Namen und die bei uns gespeicherte Adresse.";
const PREFETCH_GREETING_FIRST = "Willkommen, ich bin Silvia am Empfang und unterstütze Sie bei Ihrem Anliegen ruhig und zuverlässig.";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
let serveAudio = false;
let speakCalls = 0;
let speakAborts = 0;
let holdSpeak = false;
let holdSpeakAfter = null;
const speakTexts = [];
let transcribeCalls = 0;
let askCalls = 0;
let holdTranscribe = false;
let holdAsk = false;
let transcribeAborts = 0;
let askAborts = 0;
const releaseHeldTranscribes = [];
const releaseHeldAsks = [];
const releaseHeldSpeaks = [];
context.on("requestfailed", (request) => {
  const id = new URL(request.url()).pathname.split("/").pop();
  if (names.get(id) === "transcribeAlma_createServerFn_handler" && /aborted/i.test(request.failure()?.errorText ?? ""))
    transcribeAborts += 1;
  if (names.get(id) === "askAlma_createServerFn_handler" && /aborted/i.test(request.failure()?.errorText ?? ""))
    askAborts += 1;
  if (names.get(id) === "speakAlma_createServerFn_handler" && /aborted/i.test(request.failure()?.errorText ?? ""))
    speakAborts += 1;
});
await context.addInitScript(() => {
  const audit = { streams: [], getUserMediaStacks: [], recorderStarts: 0, recorderStops: [], recorders: [], delayed: false, release: null, audioEnabled: false, audios: [], accelerateClientTimeout: false, unhandled: [] };
  window.addEventListener("unhandledrejection", (event) => audit.unhandled.push(String(event.reason)));
  window.__teardownAudit = audit;
  const nativeIndexedDb = window.indexedDB;
  const blockFacts = sessionStorage.getItem("silvia-audit-block-facts") === "1";
  Object.defineProperty(window, "indexedDB", { configurable: true, get: () => blockFacts ? undefined : nativeIndexedDb });
  audit.idbGate = { armed: false, held: false, released: false, callbackThrough: false, release: null, pending: [] };
  const nativeOpen = nativeIndexedDb.open.bind(nativeIndexedDb);
  nativeIndexedDb.open = function (...args) {
    if (!audit.idbGate.armed || args[0] !== "alma-trained-facts") return nativeOpen(...args);
    const real = nativeOpen(...args);
    const handlers = {};
    const request = {};
    for (const name of ["onsuccess", "onerror", "onblocked", "onupgradeneeded"]) Object.defineProperty(request, name, {
      get: () => handlers[name] ?? null,
      set: (handler) => {
        handlers[name] = handler;
        if (name !== "onsuccess") real[name] = (event) => handler?.call(request, event);
      },
    });
    for (const name of ["result", "error", "readyState"]) Object.defineProperty(request, name, { get: () => real[name] });
    real.addEventListener("success", (event) => {
      event.stopImmediatePropagation();
      audit.idbGate.held = true;
      const callback = () => handlers.onsuccess?.call(request, new Event("success"));
      if (audit.idbGate.released) callback();
      else audit.idbGate.pending.push(callback);
    }, { capture: true, once: true });
    audit.idbGate.release = () => {
      if (audit.idbGate.released) return;
      audit.idbGate.released = true;
      audit.idbGate.armed = false;
      const pending = audit.idbGate.pending.splice(0);
      pending.forEach((callback) => callback());
      audit.idbGate.callbackThrough = true;
    };
    return request;
  };
  const makeStream = () => {
    const track = { readyState: "live", stops: 0, stop() { this.stops += 1; this.readyState = "ended"; } };
    const stream = { getTracks: () => [track] };
    audit.streams.push(track);
    return stream;
  };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
    getUserMedia: () => { audit.getUserMediaStacks.push(new Error().stack || ""); return audit.delayed ? new Promise((resolve) => { audit.release = () => resolve(makeStream()); }) : Promise.resolve(makeStream()); },
  } });
  class DelayedRecorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = "inactive"; audit.recorders.push(this); }
    start() { this.state = "recording"; audit.recorderStarts += 1; }
    stop() { if (this.state === "inactive") return; this.state = "inactive"; audit.recorderStops.push(this); }
  }
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: DelayedRecorder });
  const nativeSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = (handler, delay, ...args) => nativeSetTimeout(handler, delay === 35_000 && audit.accelerateClientTimeout ? 25 : delay, ...args);
  Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined });
  Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: undefined });
  const NativeAudio = window.Audio;
  function TrackedAudio(...args) {
    const source = typeof args[0] === "string" ? args[0] : "";
    // Der Headless-Browser decodiert unsere kontrollierte Data-WAV nicht
    // verlässlich. Für den Abbruchtest modellieren wir deshalb genau diesen
    // dynamischen TTS-Clip: bestätigter Start, pausierbar, keine echte Ausgabe.
    // Statische Hörproben werden in homepage-audio-error-audit nativ geprüft.
    if (source.startsWith("data:audio/wav")) {
      let paused = true;
      let currentTime = 0;
      const audio = {
        src: source,
        volume: 1,
        muted: false,
        onended: null,
        onerror: null,
        onpause: null,
        play() {
          paused = false;
          currentTime = Math.max(currentTime, 0.2);
          return Promise.resolve();
        },
        pause() {
          paused = true;
        },
      };
      Object.defineProperties(audio, {
        paused: { get: () => paused },
        currentTime: {
          get: () => currentTime,
          set: (next) => { currentTime = Number(next) || 0; },
        },
      });
      audit.audios.push(audio);
      return audio;
    }
    const audio = new NativeAudio(...args);
    audit.audios.push(audio);
    return audio;
  }
  TrackedAudio.prototype = NativeAudio.prototype;
  Object.setPrototypeOf(TrackedAudio, NativeAudio);
  window.Audio = TrackedAudio;
});
await context.route("**/*", async (route) => {
  const request = route.request();
  const requestUrl = new URL(request.url());
  if (requestUrl.origin !== origin || request.method() !== "GET" && request.method() !== "POST") return route.abort();
  if (request.method() === "POST") {
    const id = requestUrl.pathname.split("/").pop();
    if (names.get(id) === "speakAlma_createServerFn_handler") {
      speakCalls += 1;
      speakTexts.push(ttsTextFromRequest(request.postData() || ""));
      if (holdSpeak || (holdSpeakAfter !== null && speakCalls > holdSpeakAfter)) {
        return new Promise((resolve) => releaseHeldSpeaks.push(async () => {
          try {
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { ok: true, audio: LOCAL_WAV } }) });
          } catch {
            // Ein abgebrochener TTS-Request darf danach kein Audio mehr starten.
          }
          resolve();
        }));
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(serveAudio ? { result: { ok: true, audio: LOCAL_WAV } } : { ok: false }) });
    }
    if (names.get(id) === "transcribeAlma_createServerFn_handler") {
      transcribeCalls += 1;
      if (holdTranscribe) {
        return new Promise((resolve) => releaseHeldTranscribes.push(async () => {
          try {
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { ok: true, text: "verspäteter alter Satz" } }) });
          } catch {
            // Der abgebrochene Browser-Request darf diese kontrollierte späte
            // Antwort nicht mehr an die aktuelle Aufnahme zustellen.
          }
          resolve();
        }));
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { ok: true, text: "synthetischer Satz" } }) });
    }
    if (names.get(id) === "askAlma_createServerFn_handler") {
      askCalls += 1;
      if (holdAsk) {
        return new Promise((resolve) => releaseHeldAsks.push(async () => {
          try {
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { text: "verspätete alte Antwort", source: "local", action: LOCAL_ACTION } }) });
          } catch {
            // Ein abgebrochener Browser-Request darf diese Antwort nicht mehr
            // in eine aktuelle Leitung oder Tafelzustand zustellen.
          }
          resolve();
        }));
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { text: "Antwort auf den neuen Satz.", source: "local", action: LOCAL_ACTION } }) });
    }
    return route.abort();
  }
  return route.continue();
});
try {
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto(`${base}/#anrufen`, { waitUntil: "domcontentloaded" });
  async function waitForHydration() {
    await page.waitForFunction(() => {
      const button = document.querySelector("#sprechen-mode-anrufen");
      return Object.keys(button ?? {}).some((key) => key.startsWith("__reactProps$"));
    });
  }
  await waitForHydration();
  await page.evaluate(() => { window.__teardownAudit.idbGate.armed = true; });
  await begin();
  await page.waitForFunction(() => window.__teardownAudit.idbGate.held, null, { timeout: 2_000 });
  const delayedBeforeSpa = await page.evaluate(() => ({ streams: window.__teardownAudit.streams.length, audios: window.__teardownAudit.audios.length }));
  assert.deepEqual(delayedBeforeSpa, { streams: 0, audios: 0 }, `Der Datenbank-Gate darf vor der Freigabe keinen Start auslösen: ${await page.evaluate(() => window.__teardownAudit.getUserMediaStacks)}`);
  await page.locator('a[href="/preise"]').first().click();
  await page.waitForURL(/\/preise$/);
  await page.evaluate(() => window.__teardownAudit.idbGate.release());
  await page.waitForFunction(() => window.__teardownAudit.idbGate.callbackThrough, null, { timeout: 2_000 });
  await page.waitForTimeout(500);
  const delayedAfterSpa = await page.evaluate(() => ({ streams: window.__teardownAudit.streams.length, audios: window.__teardownAudit.audios.length }));
  assert.deepEqual(delayedAfterSpa, { streams: 0, audios: 0 }, "Eine nach SPA freigegebene Faktenabfrage darf keinen alten Anruf starten.");
  await page.goto(`${base}/#anrufen`, { waitUntil: "domcontentloaded" });
  await waitForHydration();
  await page.evaluate(() => { window.__teardownAudit.idbGate.armed = true; });
  await begin();
  await page.waitForFunction(() => window.__teardownAudit.idbGate.held, null, { timeout: 2_000 });
  await page.evaluate(() => window.__teardownAudit.idbGate.release());
  await page.waitForFunction(() => window.__teardownAudit.streams.length > 0, null, { timeout: 3_000 });
  const positiveGateStart = await page.evaluate(() => ({ streams: window.__teardownAudit.streams.length, audios: window.__teardownAudit.audios.length, recorderStarts: window.__teardownAudit.recorderStarts }));
  // Eine noch nicht verfügbare Fakten-Datenbank darf vor dem Gespräch weder
  // Mikrofon noch Klingeln starten; der positive Kontrollstart folgt nach Reload.
  await page.evaluate(() => sessionStorage.setItem("silvia-audit-block-facts", "1"));
  await reloadCall();
  await begin();
  await page.getByText("Demo-Praxiswissen ist lokal noch nicht bereit. Bitte erneut versuchen.", { exact: true }).last().waitFor();
  const blockedStart = await page.evaluate(() => ({ streams: window.__teardownAudit.streams.length, audios: window.__teardownAudit.audios.length }));
  assert.deepEqual(blockedStart, { streams: 0, audios: 0 }, "Vor bereitem Wissen dürfen Mikrofon und Klingeln nicht starten.");
  await page.locator('a[href="/preise"]').first().click();
  await page.waitForURL(/\/preise$/);
  await page.evaluate(() => sessionStorage.removeItem("silvia-audit-block-facts"));
  await page.goto(`${base}/#anrufen`, { waitUntil: "domcontentloaded" });
  await waitForHydration();
  async function begin() {
    await page.locator("#sprechen-mode-anrufen").click();
    await page.locator("#sprechen-anrufen").click();
  }
  async function reloadCall() {
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForHydration();
  }
  async function seedTrainedFacts(facts) {
    await page.evaluate(async (nextFacts) => new Promise((resolve, reject) => {
      const request = indexedDB.open("alma-trained-facts", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("facts")) request.result.createObjectStore("facts", { keyPath: "key" });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("facts", "readwrite");
        tx.objectStore("facts").put({ key: "current", facts: nextFacts });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
      };
    }), facts);
    await reloadCall();
  }
  async function startAudibleCall() {
    serveAudio = true;
    await reloadCall();
    await begin();
    await page.waitForFunction(() => window.__teardownAudit.audios
      .some((audio) => audio.src.startsWith("data:audio/wav") && !audio.paused && audio.currentTime > 0.1), null, { timeout: 12_000 });
    return page.evaluate(() => window.__teardownAudit.audios.findIndex(
      (audio) => audio.src.startsWith("data:audio/wav") && !audio.paused && audio.currentTime > 0.1,
    ));
  }
  async function assertStoppedAudio(index, label) {
    await page.waitForFunction((audioIndex) => {
      const audio = window.__teardownAudit.audios[audioIndex];
      return Boolean(audio?.paused);
    }, index, { timeout: 2_000 });
    const before = await page.evaluate((audioIndex) => window.__teardownAudit.audios[audioIndex].currentTime, index);
    await page.waitForTimeout(450);
    const after = await page.evaluate((audioIndex) => window.__teardownAudit.audios[audioIndex].currentTime, index);
    assert.ok(after - before < 0.05, `${label}: Die echte Audiozeit lief nach dem Abbruch weiter.`);
    return { paused: true, before, after };
  }
  async function clickPrimaryEnd() {
    await page.getByRole("button", { name: "Auflegen", exact: true }).click();
  }
  await begin();
  await page.waitForFunction(() => window.__teardownAudit.recorderStarts > 0, null, { timeout: 8_000 });
  // „Auflegen“ ist die große primäre Leitungsschaltfläche (kein separater Link mehr).
  await clickPrimaryEnd();
  await page.waitForFunction(() => window.__teardownAudit.streams.every((track) => track.readyState === "ended" && track.stops > 0), null, { timeout: 2_000 });
  const active = await page.evaluate(() => ({ streams: window.__teardownAudit.streams.map((track) => ({ readyState: track.readyState, stops: track.stops })), recorderStops: window.__teardownAudit.recorderStops.length }));
  assert(active.streams.length > 0 && active.recorderStops > 0, "Auflegen erreichte keinen aktiven synthetischen Recorderstream.");
  await page.evaluate(() => window.__teardownAudit.recorderStops.forEach((recorder) => recorder.onstop?.()));
  await reloadCall();
  await page.evaluate(() => { window.__teardownAudit.delayed = true; });
  await begin();
  await page.waitForFunction(() => typeof window.__teardownAudit.release === "function", null, { timeout: 2_000 });
  await clickPrimaryEnd();
  await page.evaluate(() => window.__teardownAudit.release());
  await page.waitForFunction(() => window.__teardownAudit.streams.length > 0 && window.__teardownAudit.streams.every((track) => track.readyState === "ended" && track.stops > 0), null, { timeout: 2_000 });
  const late = await page.evaluate(() => window.__teardownAudit.streams.map((track) => ({ readyState: track.readyState, stops: track.stops })));
  // Auch der ursprüngliche Zwei-Sekunden-Klingeltimer darf nichts neu starten.
  await page.waitForTimeout(2_200);
  const recorderStarts = await page.evaluate(() => window.__teardownAudit.recorderStarts);
  assert.equal(recorderStarts, 0, "Eine späte Mikrofonfreigabe darf keinen neuen Recorder starten.");
  // Der clientseitige Abort muss auch dann freigeben, wenn der Transport nie antwortet.
  await reloadCall();
  await page.evaluate(() => { window.__teardownAudit.delayed = false; });
  await page.evaluate(() => { window.__teardownAudit.accelerateClientTimeout = true; });
  holdTranscribe = true;
  await begin();
  await page.waitForFunction(() => window.__teardownAudit.recorders.length > 0, null, { timeout: 3_000 });
  await page.evaluate(() => {
    const rec = window.__teardownAudit.recorders.at(-1);
    rec.state = "inactive";
    rec.ondataavailable?.({ data: new Blob([new Uint8Array(600)], { type: "audio/webm" }) });
    rec.onstop?.();
  });
  await page.waitForFunction(() => document.querySelector("#sprechen-stt-fail")?.textContent?.includes("ohne Netz"), null, { timeout: 2_000 });
  assert.equal(transcribeCalls, 1, "Der hängende STT-Transport wurde nicht erreicht.");
  await page.waitForTimeout(100);
  assert.equal(transcribeAborts, 1, "Der abgelaufene clientseitige STT-Request wurde nicht abgebrochen.");
  const recorderStartsBeforeRetry = await page.evaluate(() => window.__teardownAudit.recorderStarts);
  holdTranscribe = false;
  await page.getByRole("button", { name: "Sprechen", exact: true }).click();
  await page.waitForFunction((before) => window.__teardownAudit.recorderStarts > before, recorderStartsBeforeRetry, { timeout: 2_000 });
  const secondTranscribe = page.waitForRequest((request) => {
    const id = new URL(request.url()).pathname.split("/").pop();
    return request.method() === "POST" && names.get(id) === "transcribeAlma_createServerFn_handler";
  }, { timeout: 5_000 });
  const recorderStartsBeforeAutoListen = await page.evaluate(() => window.__teardownAudit.recorderStarts);
  await page.evaluate(() => {
    const rec = window.__teardownAudit.recorders.at(-1);
    rec.state = "inactive";
    rec.ondataavailable?.({ data: new Blob([new Uint8Array(600)], { type: "audio/webm" }) });
    rec.onstop?.();
  });
  await secondTranscribe;
  await page.waitForFunction(() => [...document.querySelectorAll("[data-line-role]")]
    .some((line) => line.textContent === "synthetischer Satz"), null, { timeout: 30_000 });
  await page.waitForFunction((before) => window.__teardownAudit.recorderStarts > before, recorderStartsBeforeAutoListen, { timeout: 30_000 });
  assert.equal(transcribeCalls, 2, "Der neue Aufnahmeversuch erreichte keine zweite STT-Anfrage.");
  await Promise.all(releaseHeldTranscribes.splice(0).map((release) => release()));
  await page.waitForTimeout(50);
  assert.equal(await page.locator("[data-line-role=user]").filter({ hasText: "verspäteter alter Satz" }).count(), 0, "Eine verspätete alte STT-Antwort belebt das Gespräch wieder.");
  await clickPrimaryEnd();
  await page.evaluate(() => { window.__teardownAudit.accelerateClientTimeout = false; });
  async function triggerHeldStt() {
    await begin();
    await page.waitForFunction(() => window.__teardownAudit.recorders.length > 0, null, { timeout: 3_000 });
    await page.evaluate(() => {
      const rec = window.__teardownAudit.recorders.at(-1);
      rec.state = "inactive";
      rec.ondataavailable?.({ data: new Blob([new Uint8Array(600)], { type: "audio/webm" }) });
      rec.onstop?.();
    });
  }
  async function releaseLateSttAndAssertQuiet(linesBefore, asksBefore, label) {
    await Promise.all(releaseHeldTranscribes.splice(0).map((release) => release()));
    await page.waitForTimeout(100);
    assert.deepEqual(await page.locator("[data-line-role]").allTextContents(), linesBefore, `${label}: Eine verspätete STT-Antwort fügte eine Gesprächszeile hinzu.`);
    assert.equal(askCalls, asksBefore, `${label}: Eine verspätete STT-Antwort rief Alma erneut auf.`);
  }
  // Der normale 35-Sekunden-Timer bleibt hier aktiv: Auflegen muss den
  // hängenden Transport selbst abbrechen, bevor dessen Timeout greifen kann.
  await reloadCall();
  holdTranscribe = true;
  const abortsBeforeHangup = transcribeAborts;
  const asksBeforeHangup = askCalls;
  await triggerHeldStt();
  await page.waitForTimeout(50);
  assert.equal(transcribeCalls, 3, "Der hängende STT-Request vor Auflegen wurde nicht gestartet.");
  assert.equal(transcribeAborts, abortsBeforeHangup, "Der normale STT-Timer brach vor Auflegen zu früh ab.");
  await clickPrimaryEnd();
  const linesAfterHangup = await page.locator("[data-line-role]").allTextContents();
  await page.waitForTimeout(100);
  assert.equal(transcribeAborts, abortsBeforeHangup + 1, "Auflegen brach den hängenden STT-Request nicht ab.");
  await releaseLateSttAndAssertQuiet(linesAfterHangup, asksBeforeHangup, "Auflegen");
  // Derselbe Schutz gilt beim tatsächlichen internen Seitenwechsel.
  await reloadCall();
  holdTranscribe = true;
  const abortsBeforeSpaStt = transcribeAborts;
  const asksBeforeSpaStt = askCalls;
  await triggerHeldStt();
  await page.waitForTimeout(50);
  assert.equal(transcribeCalls, 4, "Der hängende STT-Request vor Seitenwechsel wurde nicht gestartet.");
  assert.equal(transcribeAborts, abortsBeforeSpaStt, "Der normale STT-Timer brach vor dem Seitenwechsel zu früh ab.");
  await page.locator('a[href="/preise"]').first().click();
  await page.waitForURL(/\/preise$/);
  await page.waitForFunction(() => !document.querySelector("#sprechen-anrufen"), null, { timeout: 2_000 });
  await page.waitForTimeout(100);
  const linesAfterSpa = await page.locator("[data-line-role]").allTextContents();
  await page.waitForTimeout(100);
  assert.equal(transcribeAborts, abortsBeforeSpaStt + 1, "Der Seitenwechsel brach den hängenden STT-Request nicht ab.");
  await releaseLateSttAndAssertQuiet(linesAfterSpa, asksBeforeSpaStt, "Seitenwechsel");
  holdTranscribe = false;
  await page.goto(`${base}/#anrufen`, { waitUntil: "domcontentloaded" });
  await waitForHydration();
  async function startHeldAsk(text, accelerateDeadline) {
    holdAsk = true;
    await page.evaluate((accelerate) => { window.__teardownAudit.accelerateClientTimeout = accelerate; }, accelerateDeadline);
    await begin();
    const input = page.locator("form input").last();
    await input.waitFor({ state: "visible", timeout: 4_000 });
    await input.fill(text);
    const asksBefore = askCalls;
    const abortsBefore = askAborts;
    await page.locator("form").getByRole("button", { name: "Senden", exact: true }).click();
    await page.waitForTimeout(50);
    assert.equal(askCalls, asksBefore + 1, "Der gehaltene Gesprächs-Request wurde nicht gestartet.");
    return { asksBefore, abortsBefore };
  }
  async function releaseLateAskAndAssertQuiet(linesBefore, asksBefore, label) {
    await Promise.all(releaseHeldAsks.splice(0).map((release) => release()));
    await page.waitForTimeout(100);
    assert.deepEqual(await page.locator("[data-line-role]").allTextContents(), linesBefore, `${label}: Eine verspätete Gesprächsantwort änderte die Leitung.`);
    assert.equal(askCalls, asksBefore, `${label}: Eine verspätete Antwort startete einen weiteren Gesprächsrequest.`);
  }
  // Der Test verkürzt nur die 35-s-Browserdeadline; der Produktwert bleibt
  // unverändert. Danach muss die Eingabe wieder frei sein, ohne Speicherstatus
  // zu behaupten.
  const timeoutAsk = await startHeldAsk("Synthetische Timeoutfrage", true);
  const uncertainReply = page.locator('[data-line-role="assistant"]').filter({ hasText: "Die Antwort konnte nicht bestätigt werden. Ob etwas gespeichert wurde, ist unklar." });
  await uncertainReply.waitFor({ state: "visible", timeout: 2_000 });
  await page.waitForTimeout(100);
  assert.equal(askAborts, timeoutAsk.abortsBefore + 1, "Die Gesprächsdeadline brach den Browser-Request nicht ab.");
  await page.locator("form input").last().fill("Nur Eingabefreigabe prüfen");
  assert.equal(await page.locator("form").getByRole("button", { name: "Senden", exact: true }).isDisabled(), false, "Nach der Gesprächsdeadline blieb die Eingabe gesperrt.");
  const timeoutLines = await page.locator("[data-line-role]").allTextContents();
  const asksAfterTimeout = askCalls;
  await releaseLateAskAndAssertQuiet(timeoutLines, asksAfterTimeout, "Deadline");
  await clickPrimaryEnd();
  // Beim Auflegen bleibt der normale 35-s-Timer aktiv; der Abbruch muss sofort
  // vom Gesprächsende selbst kommen.
  holdAsk = false;
  await page.evaluate(() => { window.__teardownAudit.accelerateClientTimeout = false; });
  await page.goto(`${base}/#anrufen`, { waitUntil: "domcontentloaded" });
  await waitForHydration();
  const hangupAsk = await startHeldAsk("Synthetische Auflegefrage", false);
  assert.equal(askAborts, hangupAsk.abortsBefore, "Der normale Gesprächstimer brach vor Auflegen zu früh ab.");
  await clickPrimaryEnd();
  const hangupAskLines = await page.locator("[data-line-role]").allTextContents();
  await page.waitForTimeout(100);
  assert.equal(askAborts, hangupAsk.abortsBefore + 1, "Auflegen brach den hängenden Gesprächs-Request nicht ab.");
  await releaseLateAskAndAssertQuiet(hangupAskLines, askCalls, "Auflegen");
  holdAsk = false;
  async function startHeldTts(accelerateDeadline) {
    await page.goto(`${base}/#anrufen`, { waitUntil: "domcontentloaded" });
    await waitForHydration();
    // Ara ist die Default-Stimme und nutzt für die Begrüßung direkt voice().
    // Damit trifft der Test den Gesprächspfad, nicht die Stimmenvorschau.
    serveAudio = true;
    holdSpeak = true;
    await page.evaluate((accelerate) => { window.__teardownAudit.accelerateClientTimeout = accelerate; }, accelerateDeadline);
    const callsBefore = speakCalls;
    const abortsBefore = speakAborts;
    await begin();
    await page.waitForTimeout(2_100);
    await page.waitForTimeout(50);
    assert.equal(speakCalls, callsBefore + 1, "Der gehaltene Gesprächs-TTS-Request wurde nicht gestartet.");
    return { callsBefore, abortsBefore };
  }
  async function releaseLateTtsAndAssertQuiet(audiosBefore, label) {
    await Promise.all(releaseHeldSpeaks.splice(0).map((release) => release()));
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => window.__teardownAudit.audios.filter((audio) => audio.src.startsWith("data:audio/wav")).length);
    assert.equal(after, audiosBefore, `${label}: Eine verspätete TTS-Antwort startete noch Audio.`);
  }
  const timeoutTts = await startHeldTts(true);
  await page.getByText("Silvia konnte gerade nicht sprechen. Bitte tippen oder nochmal versuchen.", { exact: true }).last().waitFor({ timeout: 2_000 });
  await page.waitForTimeout(100);
  assert.equal(speakAborts, timeoutTts.abortsBefore + 1, "Die TTS-Deadline brach den Browser-Request nicht ab.");
  await page.getByText("Silvia spricht", { exact: true }).waitFor({ state: "hidden", timeout: 2_000 });
  const timeoutTtsAudios = await page.evaluate(() => window.__teardownAudit.audios.filter((audio) => audio.src.startsWith("data:audio/wav")).length);
  await releaseLateTtsAndAssertQuiet(timeoutTtsAudios, "TTS-Deadline");
  await clickPrimaryEnd();
  holdSpeak = false;
  await page.evaluate(() => { window.__teardownAudit.accelerateClientTimeout = false; });
  const hangupTts = await startHeldTts(false);
  assert.equal(speakAborts, hangupTts.abortsBefore, "Der normale TTS-Timer brach vor Auflegen zu früh ab.");
  await clickPrimaryEnd();
  const hangupTtsAudios = await page.evaluate(() => window.__teardownAudit.audios.filter((audio) => audio.src.startsWith("data:audio/wav")).length);
  await page.waitForTimeout(100);
  assert.equal(speakAborts, hangupTts.abortsBefore + 1, "Auflegen brach den hängenden TTS-Request nicht ab.");
  await releaseLateTtsAndAssertQuiet(hangupTtsAudios, "TTS-Auflegen");
  holdSpeak = false;
  // Zwei Sätze über der Chunk-Mindestlänge erzwingen einen echten Folgechunk;
  // die Speicherung ist ausschließlich die lokale Demo-IDB dieses Audits.
  await seedTrainedFacts([PREFETCH_GREETING_FACT]);
  const prefetchCallsBefore = speakCalls;
  const prefetchAbortsBefore = speakAborts;
  const prefetchAudiosBefore = await page.evaluate(() => window.__teardownAudit.audios.filter((audio) => audio.src.startsWith("data:audio/wav")).length);
  holdSpeakAfter = prefetchCallsBefore + 1;
  serveAudio = true;
  await begin();
  await page.waitForFunction(() => window.__teardownAudit.audios
    .some((audio) => audio.src.startsWith("data:audio/wav") && !audio.paused && audio.currentTime > 0.1), null, { timeout: 4_000 });
  await page.waitForTimeout(100);
  assert.equal(speakCalls, prefetchCallsBefore + 2, "Die Begrüßung erreichte keinen vorgeladenen zweiten TTS-Chunk.");
  const prefetchTexts = speakTexts.slice(prefetchCallsBefore, prefetchCallsBefore + 2);
  assert.equal(prefetchTexts.length, 2, "Die zwei TTS-Anfragen wurden nicht eindeutig erfasst.");
  assert.equal(prefetchTexts[0], PREFETCH_GREETING_FIRST, "Der erste lokale TTS-Chunk passt nicht zur langen trainierten Begrüßung.");
  assert.notEqual(prefetchTexts[0], prefetchTexts[1], "Der gehaltene Request ist nicht der zweite Sprachchunk.");
  const prefetchAudioIndex = await page.evaluate((before) => window.__teardownAudit.audios.findIndex((audio, index) => index >= before && audio.src.startsWith("data:audio/wav") && !audio.paused && audio.currentTime > 0.1), prefetchAudiosBefore);
  assert.notEqual(prefetchAudioIndex, -1, "Der erste Chunk spielte vor dem Auflegen nicht wirklich ab.");
  await clickPrimaryEnd();
  const prefetchAudio = await assertStoppedAudio(prefetchAudioIndex, "TTS-Vorladung beim Auflegen");
  await page.waitForTimeout(100);
  assert.equal(speakAborts, prefetchAbortsBefore + 1, "Auflegen brach den vorgeladenen zweiten TTS-Request nicht ab.");
  await releaseLateTtsAndAssertQuiet(prefetchAudiosBefore + 1, "TTS-Vorladung beim Auflegen");
  const prefetchUnhandled = await page.evaluate(() => window.__teardownAudit.unhandled);
  assert.deepEqual(prefetchUnhandled, [], `Der Vorladeabbruch erzeugte eine unbehandelte Promise: ${JSON.stringify(prefetchUnhandled)}`);
  holdSpeakAfter = null;
  const hangupAudioIndex = await startAudibleCall();
  assert.notEqual(hangupAudioIndex, -1, "Der lokale WAV-TTS-Clip wurde nicht abgespielt.");
  await clickPrimaryEnd();
  const hangupAudio = await assertStoppedAudio(hangupAudioIndex, "Auflegen");
  await page.waitForFunction(() => window.__teardownAudit.streams.length > 0 && window.__teardownAudit.streams.every((track) => track.readyState === "ended" && track.stops > 0), null, { timeout: 2_000 });
  const hangupStreams = await page.evaluate(() => window.__teardownAudit.streams.map((track) => ({ readyState: track.readyState, stops: track.stops })));
  const spaAudioIndex = await startAudibleCall();
  assert.notEqual(spaAudioIndex, -1, "Der lokale WAV-TTS-Clip für den Seitenwechsel wurde nicht abgespielt.");
  await page.locator('a[href="/preise"]').first().click();
  await page.waitForURL(/\/preise$/, { timeout: 5_000 });
  const spaAudio = await assertStoppedAudio(spaAudioIndex, "SPA-Seitenwechsel");
  await page.waitForFunction(() => window.__teardownAudit.streams.length > 0 && window.__teardownAudit.streams.every((track) => track.readyState === "ended" && track.stops > 0), null, { timeout: 2_000 });
  const spaStreams = await page.evaluate(() => window.__teardownAudit.streams.map((track) => ({ readyState: track.readyState, stops: track.stops })));
  assert.equal(browserErrors.length, 0, `Unerwartete Browserfehler: ${browserErrors.join(" | ")}`);
  const result = { ok: true, delayedBeforeSpa, delayedAfterSpa, positiveGateStart, blockedStart, active, late, recorderStarts, transcribeCalls, transcribeAborts, askCalls, askAborts, speakCalls, speakAborts, delayedRecorder: true, clientTimeoutAcceleratedForAudit: "35000ms->25ms", askLifecycle: { deadline: "aborted, input free, late response quiet", hangup: "aborted, late response quiet" }, ttsLifecycle: { deadline: "aborted, speaking free, late audio quiet", hangup: "aborted, late audio quiet", prefetchHangup: { firstChunkPlayed: prefetchAudio, secondRequestAborted: true, lateAudioQuiet: true, unhandledRejections: 0 } }, sttLifecycle: { hangup: "aborted, late response quiet", spa: "aborted, late response quiet" }, hangupAudio, hangupStreams, spaAudio, spaStreams, browserErrors };
  await writeFile(join("artifacts", "homepage-call-teardown-audit.json"), `${JSON.stringify(result)}\n`);
  console.log(JSON.stringify(result));
} finally {
  await context.close();
  await browser.close();
}
