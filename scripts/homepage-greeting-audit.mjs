#!/usr/bin/env node
/**
 * Browser-Audit fuer die Homepage-Demo: Eine per UI trainierte Begruessung
 * muss nach Reload im naechsten Demo-Anruf als Text und lokaler TTS-Text gelten.
 * Startet keinen Server und verwendet weder Provider noch Praxisdaten.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { defaultSerovalPlugins } from "@tanstack/router-core";
import { fromCrossJSON, fromJSON } from "seroval";

const base = process.env.AUDIT_URL;
assert(base, "AUDIT_URL muss die bewusst gestartete lokale Audit-URL enthalten.");
const origin = new URL(base).origin;
const parsed = new URL(base);
assert(["127.0.0.1", "localhost"].includes(parsed.hostname), "AUDIT_URL muss ein lokaler localhost-Server sein.");
assert.equal(parsed.protocol, "http:", "AUDIT_URL muss eine lokale http-URL sein.");
assert.notEqual(parsed.port, "8092", "Dieses Audit verwendet niemals Port 8092.");
const root = process.env.AUDIT_BUILD_ROOT;
assert(root, "AUDIT_BUILD_ROOT muss auf die isolierte Tempkopie zeigen.");
const realLocalTts = process.env.REAL_LOCAL_TTS === "1";
const failStorageOnce = process.env.AUDIT_STORAGE_FAIL_ONCE === "1";

async function productionServerFnNames() {
  try {
    const runtime = await readFile(join(root, ".output", "server", "index.mjs"), "utf8");
    return new Map([...runtime.matchAll(/"([a-f0-9]{64})":\s*\{\s*functionName:\s*"([^"]+)"/g)]
      .map(([, id, name]) => [id, name]));
  } catch {
    return new Map();
  }
}
const productionNames = await productionServerFnNames();
assert(productionNames.size > 0, "Der isolierte Produktionsbuild enthält kein ServerFn-Manifest.");
assert([...productionNames.values()].includes("askAlma_createServerFn_handler"), "askAlma fehlt im isolierten ServerFn-Manifest.");
assert([...productionNames.values()].includes("speakAlma_createServerFn_handler"), "speakAlma fehlt im isolierten ServerFn-Manifest.");

const fact = "Bei der Begrüßung sagen Sie: Grüß Gott, Audit Ordination Sonnenfeld.";
const greeting = "Grüß Gott, Audit Ordination Sonnenfeld.";
const oldParkingRule = "Die Parkplätze sind im Innenhof.";
const newParkingRule = "Die Parkplätze sind vor dem Haus.";
const parkingQuestion = "Wo sind die Parkplätze?";
const openingQuestion = "Haben Sie heute geöffnet?";
// IDENT_GREETING_SUFFIX aus src/lib/alma/identify.ts: Der Datenabgleich ist
// Teil jeder Begrüßung und darf durch die trainierte Formel nicht entfallen.
const identifySuffix = " Für den Datenabgleich brauche ich nur noch Ihre Adresse.";
const expectedGreeting = `${greeting}${identifySuffix}`;
const deadline = Date.now() + 90_000;
function remaining() {
  const ms = deadline - Date.now();
  if (ms <= 0) throw new Error("Audit-Frist von 90 Sekunden überschritten.");
  return ms;
}
async function bounded(promise) {
  const ms = remaining();
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Audit-Frist von 90 Sekunden überschritten.")), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function waitForTrainingControl(page) {
  // SSR rendert den Knopf bereits ohne Handler. Erst nach React-Hydration klicken.
  await page.waitForFunction(() => {
    const button = document.querySelector("#sprechen-mode-trainieren");
    const props = Object.keys(button ?? {}).find((key) => key.startsWith("__reactProps$"));
    return Boolean(props && typeof button[props]?.onClick === "function");
  }, null, { timeout: Math.min(10_000, remaining()) });
}
function serverFnName(request) {
  const id = new URL(request.url()).pathname.split("/").pop() || "";
  if (productionNames.has(id)) return productionNames.get(id);
  // Vite verwendet einen lesbaren Base64-JSON-Descriptor. Auch dort gilt
  // ausschließlich ein exakter export-Name, keine Teiltext-Heuristik.
  try {
    const data = JSON.parse(Buffer.from(id, "base64url").toString("utf8"));
    return typeof data?.export === "string" ? data.export : "";
  } catch {
    return "";
  }
}
async function decodeServerFnResponse(response) {
  const body = await response.json();
  return response.headers()["x-tss-serialized"] === "true"
    ? fromCrossJSON(body, { plugins: defaultSerovalPlugins })
    : body;
}
function ttsTextFromRequest(body) {
  // TanStack serialisiert Requests mit toJSONAsync; nur Responses verwenden CrossJSON.
  const decoded = fromJSON(JSON.parse(body), { plugins: defaultSerovalPlugins });
  assert.equal(typeof decoded?.data?.text, "string", "TTS-Anfrage ohne Text");
  return decoded.data.text;
}

// Kurze, vollständig lokale WAV-Antwort. So kann der Browser alle
// Begrüßungsabschnitte abspielen, ohne einen TTS-Provider zu kontaktieren.
function localWav() {
  const rate = 8_000;
  const samples = Buffer.alloc(800, 128);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + samples.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28); header.writeUInt16LE(1, 32); header.writeUInt16LE(8, 34); header.write("data", 36); header.writeUInt32LE(samples.length, 40);
  return `data:audio/wav;base64,${Buffer.concat([header, samples]).toString("base64")}`;
}
const LOCAL_WAV = localWav();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
let askPosts = 0;
let ttsPosts = 0;
const blockedExternal = [];
let blockedPosts = 0;
const spokenTexts = [];

await context.addInitScript(({ realLocalTts: _realLocalTts }) => {
  // Kein echtes Mikrofon: Der Audit verwendet die sichtbare Texteingabe,
  // muss aber auch dann sicher bleiben, falls die Leitung zuhören beginnt.
  const track = { readyState: "live", stop() { this.readyState = "ended"; } };
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [track] }) },
  });
  class FakeMediaRecorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = "inactive"; }
    start() { this.state = "recording"; }
    stop() { if (this.state !== "recording") return; this.state = "inactive"; this.onstop?.(); }
  }
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
  Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined });
  Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: undefined });
  const audit = { created: 0, events: [] };
  Object.defineProperty(window, "__silviaLocalTtsAudio", { value: audit });
  const NativeAudio = window.Audio;
  window.Audio = function (...args) {
    const audio = new NativeAudio(...args);
    const id = audit.created++;
    for (const event of ["loadedmetadata", "ended", "error"]) {
      audio.addEventListener(event, () => audit.events.push({
        id, event, duration: Number.isFinite(audio.duration) ? audio.duration : 0,
        currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
        paused: audio.paused, readyState: audio.readyState, networkState: audio.networkState,
        srcType: (audio.currentSrc || audio.src).split(":", 1)[0], errorCode: audio.error?.code ?? null,
      }));
    }
    if (!_realLocalTts) {
      // Der kleine Data-WAV wird im Headless-Browser nicht zuverlässig
      // abgespielt. Simuliere daher die bestätigte Wiedergabe deterministisch,
      // damit der nächste TTS-Abschnitt erst danach angefordert wird.
      audio.play = () => {
        queueMicrotask(() => audio.dispatchEvent(new Event("ended")));
        return Promise.resolve();
      };
    }
    return audio;
  };
  window.Audio.prototype = NativeAudio.prototype;
  window.__auditStorageFailOnce = false;
  const nativePut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === "facts" && window.__auditStorageFailOnce) {
      window.__auditStorageFailOnce = false;
      const request = nativePut.apply(this, args);
      this.transaction.abort();
      return request;
    }
    return nativePut.apply(this, args);
  };
  window.__auditFacts = () => new Promise((resolve, reject) => {
    const open = indexedDB.open("alma-trained-facts", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result; const get = db.transaction("facts", "readonly").objectStore("facts").get("current"); get.onsuccess = () => { db.close(); resolve(get.result?.facts ?? []); }; get.onerror = () => { db.close(); reject(get.error); }; };
  });
}, { failOnce: failStorageOnce, realLocalTts });

await context.route("**/*", async (route) => {
  const request = route.request();
  if (new URL(request.url()).origin !== origin) {
    blockedExternal.push({ method: request.method(), type: request.resourceType(), url: request.url() });
    return route.abort();
  }
  if (request.method() === "POST") {
    blockedPosts += 1;
    return route.abort();
  }
  return route.fallback();
});

await context.route("**/_serverFn/**", async (route) => {
  const request = route.request();
  if (new URL(request.url()).origin !== origin) {
    blockedExternal.push({ method: request.method(), type: request.resourceType(), url: request.url() });
    return route.abort();
  }
  if (request.method() !== "POST") return route.fallback();
  const name = serverFnName(request);
  const body = request.postData() || "";
  if (name === "askAlma_createServerFn_handler") {
    askPosts += 1;
    return route.continue();
  }
  if (name === "speakAlma_createServerFn_handler") {
    ttsPosts += 1;
    const text = ttsTextFromRequest(body);
    spokenTexts.push(text);
    if (realLocalTts) {
      return route.continue();
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: { ok: true, audio: LOCAL_WAV } }),
    });
  }
  blockedPosts += 1;
  return route.abort();
});

try {
  const page = await context.newPage();
  console.log("STEP homepage");
  page.setDefaultTimeout(remaining());
  await bounded(page.goto(`${base}/#anrufen`, { waitUntil: "domcontentloaded", timeout: remaining() }));
  await waitForTrainingControl(page);
  assert.equal(await bounded(page.evaluate(() => localStorage.getItem("alma-ordination"))), null, "Der Audit darf Praxiswissen nicht vorab in localStorage schreiben.");

  const wissenPage = await context.newPage();
  wissenPage.setDefaultTimeout(remaining());
  await bounded(wissenPage.goto(`${base}/sprechen?training=wissen`, { waitUntil: "domcontentloaded", timeout: remaining() }));
  await waitForTrainingControl(wissenPage);
  assert.equal(await bounded(wissenPage.locator("#sprechen-training-wissen").getAttribute("aria-pressed", { timeout: remaining() })), "true", "Der direkte Pfad /sprechen?training=wissen aktiviert die Wissen-Schulung nicht.");
  await wissenPage.close();

  console.log("STEP training");
  await bounded(page.locator("#sprechen-mode-trainieren").click({ timeout: remaining() }));
  await bounded(page.locator("#sprechen-training-wissen").click({ timeout: remaining() }));
  assert.equal(await bounded(page.locator("#sprechen-training-wissen").getAttribute("aria-pressed", { timeout: remaining() })), "true", "Praxiswissen wurde nicht gewählt.");
  await bounded(page.locator("#sprechen-anrufen").click({ timeout: remaining() }));
  await bounded(page.locator("#sprechen-training-beenden").waitFor({ timeout: remaining() }));
  const input = page.locator("form input").first();
  await bounded(input.waitFor({ timeout: remaining() }));
  const finish = page.getByRole("button", { name: "Fertig", exact: true });
  // Nach der Begrüßung startet Zuhören asynchron und blendet Senden aus.
  // Nicht zwischen Formularanzeige und Aufnahmebeginn in diesen Wechsel klicken.
  await finish.waitFor({ timeout: Math.min(realLocalTts ? 45_000 : 10_000, remaining()) });
  await bounded(finish.click({ timeout: remaining() }));
  console.log("STEP input");
  await bounded(input.fill(fact, { timeout: remaining() }));
  if (failStorageOnce) await bounded(page.evaluate(() => { window.__auditStorageFailOnce = true; }));
  const askResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" && serverFnName(response.request()) === "askAlma_createServerFn_handler",
  { timeout: remaining() });
  await bounded(input.locator("xpath=ancestor::form").getByRole("button", { name: "Senden", exact: true }).click({ timeout: remaining() }));
  console.log("STEP response");
  const askResult = await bounded(decodeServerFnResponse(await bounded(askResponse)));
  const localAnswer = askResult?.result ?? askResult;
  assert(localAnswer?.text, "Die echte lokale askAlma-Antwort enthält keinen Text.");
  assert.equal(localAnswer?.source, "local", "Die Schulungsantwort war nicht lokal; ein Provider darf in diesem Audit nicht verwendet werden.");
  if (failStorageOnce) {
    await bounded(page.locator('[data-line-role="assistant"]', { hasText: "Der Hinweis konnte nicht gespeichert werden. Bitte erneut senden." }).waitFor({ timeout: remaining() }));
    assert.equal(await bounded(page.evaluate(() => window.__auditStorageFailOnce)), false, "Der gezielte IDB-Abbruch wurde nicht verbraucht.");
    const failedAdd = await bounded(page.evaluate(async (_expected) => {
      const facts = await window.__auditFacts();
      const input = document.querySelector("form input");
      return { facts, input: input?.value ?? "" };
    }, fact));
    assert(!failedAdd.facts.includes(fact), `Ein Speicherfehler darf keinen Erfolg vortäuschen: ${JSON.stringify(failedAdd)}`);
    assert.equal(failedAdd.input, fact, "Die nicht gespeicherte Eingabe muss für den Retry erhalten bleiben.");
    const retryResponse = page.waitForResponse((response) =>
      response.request().method() === "POST" && serverFnName(response.request()) === "askAlma_createServerFn_handler",
    { timeout: remaining() });
    await bounded(input.locator("xpath=ancestor::form").getByRole("button", { name: "Senden", exact: true }).click({ timeout: remaining() }));
    await bounded(decodeServerFnResponse(await bounded(retryResponse)));
  }
  await bounded(page.waitForFunction(async (expected) => (await window.__auditFacts()).includes(expected), fact, { timeout: remaining() }));

  async function finishListeningForTyping() {
    const finish = page.getByRole("button", { name: "Fertig", exact: true });
    try {
      await bounded(page.waitForFunction(() => !document.body.textContent?.includes("Silvia spricht …"),
        null, { timeout: Math.min(realLocalTts ? 45_000 : 10_000, remaining()) }));
    } catch (error) {
      const state = await page.evaluate(() => ({
        speaking: document.body.textContent?.includes("Silvia spricht …"),
        input: document.querySelector("form input")?.value,
        readOnly: document.querySelector("form input")?.readOnly,
        buttons: [...document.querySelectorAll("form button")].map((button) => ({ text: button.textContent?.trim(), disabled: button.disabled })),
      }));
      throw new Error(`Eingabebereitschaft fehlt: ${JSON.stringify(state)}; ${error instanceof Error ? error.message : String(error)}`);
    }
    if (await finish.isVisible()) await bounded(finish.click({ timeout: remaining() }));
    try {
      await bounded(page.waitForFunction(() => {
        const input = document.querySelector("form input");
        const send = [...document.querySelectorAll("form button")]
          .find((button) => button.textContent?.trim() === "Senden");
        return input && !input.readOnly && send;
      }, null, { timeout: Math.min(8_000, remaining()) }));
    } catch (error) {
      const state = await page.evaluate(() => ({
        input: document.querySelector("form input")?.value,
        readOnly: document.querySelector("form input")?.readOnly,
        buttons: [...document.querySelectorAll("form button")].map((button) => ({ text: button.textContent?.trim(), disabled: button.disabled })),
      }));
      throw new Error(`Senden nicht bereit: ${JSON.stringify(state)}; ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("STEP parking-rule");
  // Eine Praxisregel wird über den vorhandenen Korrigieren-Ablauf ersetzt;
  // zwei widersprüchliche Regeln werden nicht automatisch zusammengeführt.
  async function sendTrainingFact(rule) {
    console.log(`STEP train ${rule}`);
    await finishListeningForTyping();
    await bounded(input.fill(rule, { timeout: remaining() }));
    const response = page.waitForResponse((candidate) =>
      candidate.request().method() === "POST" && serverFnName(candidate.request()) === "askAlma_createServerFn_handler",
    { timeout: Math.min(8_000, remaining()) });
    const submit = input.locator("xpath=ancestor::form").getByRole("button", { name: "Senden", exact: true });
    await bounded(submit.click({ timeout: remaining() }));
    let observedResponse;
    try {
      observedResponse = await bounded(response);
    } catch (error) {
      const state = await page.evaluate(() => ({
        input: document.querySelector("form input")?.value,
        readOnly: document.querySelector("form input")?.readOnly,
        buttons: [...document.querySelectorAll("form button")].map((button) => ({ text: button.textContent?.trim(), disabled: button.disabled })),
        lines: [...document.querySelectorAll("[data-line-role]")].map((line) => line.textContent?.slice(0, 120)),
      }));
      throw new Error(`Trainings-POST blieb aus: ${JSON.stringify(state)}; ${error instanceof Error ? error.message : String(error)}`);
    }
    const result = await bounded(decodeServerFnResponse(observedResponse));
    const answer = result?.result ?? result;
    assert.equal(answer?.source, "local", "Die Praxiswissens-Schulung darf keinen Provider verwenden.");
    await bounded(page.waitForFunction(async (expected) => (await window.__auditFacts()).includes(expected), rule, { timeout: remaining() }));
    const correction = page.locator('[data-line-role="user"]', { hasText: rule })
      .getByRole("button", { name: "Korrigieren", exact: true });
    await bounded(correction.waitFor({ timeout: remaining() }));
    return correction;
  }
  const parkingCorrection = await sendTrainingFact(oldParkingRule);
  console.log("STEP correct parking-rule");
  await bounded(parkingCorrection.click({ timeout: remaining() }));
  console.log("STEP correction-form");
  await bounded(input.fill(newParkingRule, { timeout: remaining() }));
  if (failStorageOnce) await bounded(page.evaluate(() => { window.__auditStorageFailOnce = true; }));
  await bounded(input.locator("xpath=ancestor::form").getByRole("button", { name: "Korrigieren", exact: true }).click({ timeout: remaining() }));
  if (failStorageOnce) {
    await bounded(page.getByText("Demo-Hinweis konnte nicht korrigiert werden. Bitte prüfen und erneut versuchen.", { exact: true }).last().waitFor({ timeout: remaining() }));
    assert.equal(await bounded(page.evaluate(() => window.__auditStorageFailOnce)), false, "Der gezielte Korrektur-Abbruch wurde nicht verbraucht.");
    await bounded(page.waitForFunction(async (oldRule) => (await window.__auditFacts()).includes(oldRule), oldParkingRule, { timeout: Math.min(5_000, remaining()) }));
    const failedReplace = await bounded(page.evaluate(async () => ({ facts: await window.__auditFacts(), input: document.querySelector("form input")?.value ?? "" })));
    assert(failedReplace.facts.includes(oldParkingRule) && !failedReplace.facts.includes(newParkingRule), `Die alte Regel muss nach Speicherfehler erhalten bleiben: ${JSON.stringify(failedReplace)}`);
    assert.equal(failedReplace.input, newParkingRule, "Die Korrektur muss nach Speicherfehler für den Retry erhalten bleiben.");
    await bounded(input.locator("xpath=ancestor::form").getByRole("button", { name: "Korrigieren", exact: true }).click({ timeout: remaining() }));
  }
  console.log("STEP correction-sent");
  // Korrekturen werden im UI asynchron in IndexedDB gespeichert. Der Klick
  // deaktiviert den Button sofort; erst wenn der Korrekturhinweis verschwindet,
  // ist der Speichervorgang erfolgreich abgeschlossen. Nicht den Zwischen-
  // zustand direkt nach dem Klick prüfen.
  await bounded(page.waitForFunction(() =>
    !document.querySelector("#hoer-korrigieren-note") &&
    [...document.querySelectorAll("form button")].every((button) =>
      button.textContent?.trim() !== "Korrigieren" || !button.disabled,
    ),
    { timeout: remaining() },
  ));
  const correctionState = () => page.evaluate(async () => {
    const input = document.querySelector("form input");
    const button = [...document.querySelectorAll("form button")].find((item) => item.textContent?.trim() === "Korrigieren");
    return { facts: await window.__auditFacts(), input: input?.value ?? "", readOnly: input?.readOnly ?? null, correctionDisabled: button?.disabled ?? null, correcting: Boolean(document.querySelector("#hoer-korrigieren-note")), speaking: document.body.textContent?.includes("Silvia spricht …") ?? false };
  });
  const corrected = await bounded(correctionState());
  console.log(`CORRECTION_STATE ${JSON.stringify(corrected)}`);
  assert(corrected.facts.includes(newParkingRule) && !corrected.facts.includes(oldParkingRule), `Praxisregel wurde nicht ersetzt: ${JSON.stringify(corrected)}`);
  await bounded(page.locator("#sprechen-training-beenden").click({ timeout: remaining() }));
  const speechButton = page.locator("#sprechen-training-sprache");
  const speechState = await bounded(speechButton.evaluate((button) => ({ disabled: button.disabled, pressed: button.getAttribute("aria-pressed") })));
  assert.equal(speechState.disabled, false, `Sprachtraining ist nach Praxiswissen unerwartet gesperrt: ${JSON.stringify(speechState)}`);
  await bounded(speechButton.click({ timeout: Math.min(5_000, remaining()) }));
  console.log("STEP speech-training");
  assert.equal(await bounded(speechButton.getAttribute("aria-pressed", { timeout: remaining() })), "true");
  assert.equal(await bounded(page.getByRole("list", { name: "Gelernte Praxisregeln" }).count()), 0, "Sprachtraining darf Praxiswissen nicht anzeigen.");

  console.log("STEP reload");
  await bounded(page.reload({ waitUntil: "domcontentloaded", timeout: remaining() }));
  await waitForTrainingControl(page);
  const callTtsStart = spokenTexts.length;
  const audioStart = await bounded(page.evaluate(() => window.__silviaLocalTtsAudio.created));
  await bounded(page.locator("#sprechen-mode-anrufen").click({ timeout: remaining() }));
  await bounded(page.locator("#sprechen-anrufen").click({ timeout: remaining() }));
  console.log("STEP greeting");
  const firstAssistant = page.locator('[data-line-role="assistant"]').first();
  await bounded(firstAssistant.waitFor({ timeout: remaining() }));
  await bounded(page.waitForFunction((expected) =>
    document.querySelector('[data-line-role="assistant"]')?.textContent?.includes(expected),
  expectedGreeting, { timeout: remaining() }));

  const firstLine = await bounded(firstAssistant.innerText({ timeout: remaining() }));
  assert.equal(firstLine, expectedGreeting, "Die erste Assistant-Zeile enthält nicht die trainierte Begrüßung samt Datenabgleich.");
  assert(!firstLine.includes("Ordination Huber"), "Die alte Huber-Begrüßung blieb in der ersten Assistant-Zeile.");
  // speechChunks übergibt Grußformel und Datenabgleich in getrennten Anfragen.
  // Eine eigene kurze Frist macht eine konkrete TTS-Abweichung sichtbar, statt
  // den gesamten 90-Sekunden-Audit kommentarlos auszureizen.
  const speechDeadline = Math.min(Date.now() + (realLocalTts ? 35_000 : 10_000), deadline);
  while (spokenTexts.slice(callTtsStart).join(" ") !== expectedGreeting) {
    if (Date.now() >= speechDeadline) {
      const observed = await page.evaluate(() => window.__silviaLocalTtsAudio);
      throw new Error(`TTS-Begrüßung unvollständig: erwartet ${JSON.stringify(expectedGreeting)}, erhalten ${JSON.stringify(spokenTexts.slice(callTtsStart))}; audio=${JSON.stringify(observed)}`);
    }
    await bounded(new Promise((yes) => setTimeout(yes, 50)));
  }
  const callTtsTexts = spokenTexts.slice(callTtsStart);
  assert.equal(callTtsTexts.join(" "), expectedGreeting, "Die TTS-Textteile entsprechen nicht der sichtbaren Begrüßung.");
  let audioEvidence = null;
  if (realLocalTts) {
    try {
      await bounded(page.waitForFunction(({ start, chunks }) => {
        const audit = window.__silviaLocalTtsAudio;
        const ids = [...new Set(audit.events
          .filter((event) => event.id >= start && ["data", "blob"].includes(event.srcType))
          .map((event) => event.id))].sort((a, b) => a - b);
        if (ids.length < chunks) return false;
        return ids.slice(0, chunks).every((id) => {
          const events = audit.events.filter((event) => event.id === id);
          return events.some((event) => event.event === "loadedmetadata" && event.duration > 0)
            && events.some((event) => event.event === "ended")
            && !events.some((event) => event.event === "error");
        });
      }, { start: audioStart, chunks: callTtsTexts.length }, { timeout: Math.min(30_000, remaining()) }));
    } catch (error) {
      const observed = await page.evaluate(() => window.__silviaLocalTtsAudio);
      throw new Error(`Lokaler Audio-Playback-Nachweis unvollständig: ${JSON.stringify(observed)}; ${error instanceof Error ? error.message : String(error)}`);
    }
    audioEvidence = await bounded(page.evaluate(({ start, texts }) => {
      const audit = window.__silviaLocalTtsAudio;
      const ids = [...new Set(audit.events
        .filter((event) => event.id >= start && ["data", "blob"].includes(event.srcType))
        .map((event) => event.id))].sort((a, b) => a - b);
      return { chunks: texts.map((text, offset) => ({
        text,
        audioId: ids[offset],
        events: audit.events.filter((event) => event.id === ids[offset]),
      })) };
    }, { start: audioStart, texts: callTtsTexts }));
  }
  console.log("STEP parking-answer");
  const questionInput = page.locator("form input").first();
  await finishListeningForTyping();
  await bounded(questionInput.fill(parkingQuestion, { timeout: remaining() }));
  const answerResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" && serverFnName(response.request()) === "askAlma_createServerFn_handler",
  { timeout: remaining() });
  await bounded(questionInput.locator("xpath=ancestor::form").getByRole("button", { name: "Senden", exact: true }).click({ timeout: remaining() }));
  const answerResult = await bounded(decodeServerFnResponse(await bounded(answerResponse)));
  const parkingAnswer = answerResult?.result ?? answerResult;
  assert.equal(parkingAnswer?.source, "local", "Die Antwort auf Praxiswissen muss lokal erfolgen.");
  assert.match(parkingAnswer?.text ?? "", /Parkplätze sind vor dem Haus/, "Die korrigierte Parkplatzregel wurde nicht beantwortet.");
  assert.doesNotMatch(parkingAnswer?.text ?? "", /Innenhof/, "Die ersetzte Parkplatzregel blieb in der Antwort.");
  await bounded(page.waitForFunction(() => [...document.querySelectorAll('[data-line-role="assistant"]')]
    .some((line) => line.textContent?.includes("Parkplätze sind vor dem Haus")), null, { timeout: remaining() }));
  await finishListeningForTyping();
  await bounded(questionInput.fill(openingQuestion, { timeout: remaining() }));
  const openingResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" && serverFnName(response.request()) === "askAlma_createServerFn_handler",
  { timeout: remaining() });
  await bounded(questionInput.locator("xpath=ancestor::form").getByRole("button", { name: "Senden", exact: true }).click({ timeout: remaining() }));
  const openingResult = await bounded(decodeServerFnResponse(await bounded(openingResponse)));
  const openingAnswer = openingResult?.result ?? openingResult;
  assert.equal(openingAnswer?.source, "local", "Auch die fremde Öffnungsfrage muss ohne Provider beantwortet werden.");
  assert.doesNotMatch(openingAnswer?.text ?? "", /Parkplätze|vor dem Haus/, "Eine fremde Öffnungsfrage darf nicht die Parkplatzregel auslösen.");
  assert.equal(askPosts, failStorageOnce ? 5 : 4, `Erwartet zwei Schulungen und zwei lokale Antworten${failStorageOnce ? " plus Retry" : ""}: beobachtet ${askPosts} askAlma-POSTs.`);
  assert(ttsPosts >= 1, "Der lokale TTS-Mock wurde nicht verwendet.");
  assert.equal(blockedExternal.filter((item) => item.method !== "GET").length, 0, "Ein externer Nicht-GET-Request wurde versucht.");
  assert.equal(blockedPosts, 0, `Unerwartete POSTs beobachtet: ${blockedPosts}.`);
  const result = { ok: true, base, askPosts, ttsPosts, greeting: expectedGreeting, parkingAnswer: parkingAnswer.text, openingAnswer: openingAnswer.text, callTtsTexts, realLocalTts, audioPlaybackVerified: Boolean(audioEvidence), audioEvidence, externalBlocked: blockedExternal.length, externalAllowed: 0 };
  const evidenceDir = new URL("../artifacts/", import.meta.url);
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(new URL(failStorageOnce ? "homepage-knowledge-storage-audit.json" : "homepage-knowledge-audit.json", evidenceDir), `${JSON.stringify(result)}\n`, "utf8");
  console.log(JSON.stringify(result));
} finally {
  await context.close();
  await browser.close();
}
