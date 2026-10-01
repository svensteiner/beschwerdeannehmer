// Echte lokale askAlma-Demoabnahme fuer explizit abgelehnte Termin-/Rueckrufaktionen.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { defaultSerovalPlugins } from "@tanstack/router-core";
import { fromCrossJSON, fromJSON } from "seroval";

const base = process.env.AUDIT_URL;
assert(base, "AUDIT_URL fehlt.");
const origin = new URL(base).origin;
const root = process.env.AUDIT_BUILD_ROOT;
assert(root, "AUDIT_BUILD_ROOT fehlt.");
const parsed = new URL(base);
assert.equal(parsed.protocol, "http:");
assert.equal(parsed.hostname, "127.0.0.1");
assert.notEqual(parsed.port, "8092");

const runtime = await readFile(join(root, ".output", "server", "index.mjs"), "utf8");
const names = new Map([...runtime.matchAll(/"([a-f0-9]{64})":\s*\{\s*functionName:\s*"([^"]+)"/g)]
  .map(([, id, name]) => [id, name]));
assert([...names.values()].includes("askAlma_createServerFn_handler"), "askAlma fehlt im Manifest.");
assert([...names.values()].includes("speakAlma_createServerFn_handler"), "speakAlma fehlt im Manifest.");

function serverFnName(request) {
  const id = new URL(request.url()).pathname.split("/").pop() || "";
  if (names.has(id)) return names.get(id);
  try { return JSON.parse(Buffer.from(id, "base64url").toString("utf8"))?.export || ""; } catch { return ""; }
}
async function decode(response) {
  const body = await response.json();
  return response.headers()["x-tss-serialized"] === "true"
    ? fromCrossJSON(body, { plugins: defaultSerovalPlugins })
    : body;
}
function ttsText(request) {
  const value = fromJSON(JSON.parse(request.postData() || "{}"), { plugins: defaultSerovalPlugins });
  assert.equal(typeof value?.data?.text, "string");
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const external = [];
const blockedPosts = [];
let askPosts = 0;
let ttsPosts = 0;
const pageErrors = [];

await context.addInitScript(() => {
  const track = { readyState: "live", stop() { this.readyState = "ended"; } };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [track] }) } });
  class FakeMediaRecorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = "inactive"; window.__auditRecorder = this; }
    start() { this.state = "recording"; }
    stop() { if (this.state === "recording") { this.state = "inactive"; this.onstop?.(); } }
  }
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
  Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined });
  Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: undefined });
});

await context.route("**/*", async (route) => {
  const request = route.request();
  if (new URL(request.url()).origin !== origin) {
    external.push({ method: request.method(), url: request.url() });
    return route.abort();
  }
  if (request.method() === "POST") {
    blockedPosts.push({ name: serverFnName(request), url: request.url() });
    return route.abort();
  }
  return route.fallback();
});
await context.route("**/_serverFn/**", async (route) => {
  const request = route.request();
  if (new URL(request.url()).origin !== origin) {
    external.push({ method: request.method(), url: request.url() });
    return route.abort();
  }
  if (request.method() !== "POST") return route.fallback();
  const name = serverFnName(request);
  if (name === "askAlma_createServerFn_handler") {
    askPosts += 1;
    return route.continue();
  }
  if (name === "speakAlma_createServerFn_handler") {
    ttsPosts += 1;
    ttsText(request);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false }) });
  }
  blockedPosts.push({ name, url: request.url() });
  return route.abort();
});

function state(page) {
  return page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("alma-ordination") || "{}").state || {};
    return {
      appointments: stored.extraAppointments || [],
      calls: stored.extraCalls || [],
      callbackThreads: (stored.extraThreads || []).filter((thread) => String(thread.id || "").startsWith("cb-")),
    };
  });
}

try {
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${base}/#anrufen`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const button = document.querySelector("#sprechen-mode-anrufen");
    const key = Object.keys(button || {}).find((name) => name.startsWith("__reactProps$"));
    return Boolean(key && typeof button[key]?.onClick === "function");
  });

  let first = true;
  async function freshCall() {
    if (!first) await page.getByRole("button", { name: "Auflegen", exact: true }).click();
    first = false;
    await page.locator("#sprechen-mode-anrufen").click();
    await page.locator("#sprechen-anrufen").click();
    await page.waitForFunction(() => window.__auditRecorder?.state === "recording", null, { timeout: 12_000 });
    await page.evaluate(() => window.__auditRecorder?.stop());
    const input = page.locator("form input").first();
    await input.waitFor({ timeout: 8_000 });
    return input;
  }
  async function runCase(name, text, expected) {
    const before = await state(page);
    const input = await freshCall();
    await input.fill(text);
    const responseWait = page.waitForResponse((response) =>
      response.request().method() === "POST" && serverFnName(response.request()) === "askAlma_createServerFn_handler",
    );
    await input.locator("xpath=ancestor::form").getByRole("button", { name: "Senden", exact: true }).click();
    const response = await decode(await responseWait);
    const answer = response?.result ?? response;
    assert.equal(answer?.source, "local", `${name}: askAlma darf keinen Provider verwenden.`);
    assert.equal(answer?.action?.type, expected.type, `${name}: falscher Aktionstyp.`);
    assert.equal(answer?.action?.kind, expected.kind, `${name}: falsche Aktionsart.`);
    // Die sichtbare Antwort trägt zusätzlich ihr Herkunftslabel ("lokal").
    // Entscheidend ist, dass der Antworttext selbst im Gespräch erscheint.
    await page.waitForFunction((text) => [...document.querySelectorAll('[data-line-role="assistant"]')]
      .some((line) => line.textContent?.includes(text)), answer.text);
    await page.waitForFunction((callCount) => {
      const stored = JSON.parse(localStorage.getItem("alma-ordination") || "{}").state || {};
      return (stored.extraCalls || []).length === callCount + 1;
    }, before.calls.length);
    const after = await state(page);
    const call = after.calls[0];
    assert.equal(after.appointments.length, before.appointments.length + expected.appointments, `${name}: falsche Terminanzahl.`);
    assert.equal(call.action, expected.callAction, `${name}: falscher gespeicherter Anruf.`);
    assert.equal(after.callbackThreads.length, before.callbackThreads.length + expected.callbackThreads, `${name}: falscher Rückrufzettel.`);
    return { name, text, answer: { source: answer.source, action: answer.action }, storedAction: call.action, appointments: after.appointments.length, callbackThreads: after.callbackThreads.length };
  }

  const results = [];
  results.push(await runCase("abgelehnter Termin, gewünschter Rückruf", "Bitte keinen Termin buchen, nur zurückrufen.", { type: "none", kind: "Rückruf", appointments: 0, callAction: "Rückrufzettel", callbackThreads: 1 }));
  results.push(await runCase("abgelehnter Rückruf, Öffnungszeiten", "Ich möchte keinen Rückruf, nur die Öffnungszeiten wissen.", { type: "none", kind: "Info", appointments: 0, callAction: "Auskunft hinterlegt", callbackThreads: 0 }));
  results.push(await runCase("positiver Termin", "Bitte einen Termin buchen.", { type: "book", kind: "Termin", appointments: 1, callAction: "Termin gelegt", callbackThreads: 0 }));
  results.push(await runCase("positiver Rückruf", "Bitte rufen Sie mich zurück.", { type: "none", kind: "Rückruf", appointments: 0, callAction: "Rückrufzettel", callbackThreads: 1 }));

  const beforeReload = await state(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  const persisted = await state(page);
  assert.deepEqual(persisted, beforeReload, "Reload darf keinen gespeicherten Gesprächs- oder Termininhalt verändern.");
  assert.equal(persisted.appointments.length, 1, "Nach Reload darf nur der positive Termin gespeichert sein.");
  assert.equal(persisted.calls.length, 4, "Nach Reload müssen alle vier synthetischen Gespräche vorliegen.");
  assert.equal(persisted.callbackThreads.length, 2, "Nach Reload müssen nur die zwei Rückrufzettel vorliegen.");
  assert.equal(askPosts, 4, `Erwartet vier echte askAlma-POSTs, beobachtet ${askPosts}.`);
  assert(ttsPosts >= 1, "Der lokale TTS-Mock wurde nicht verwendet.");
  assert.deepEqual(external, [], `Externer Request: ${JSON.stringify(external)}`);
  assert.deepEqual(blockedPosts, [], `Unerwarteter POST: ${JSON.stringify(blockedPosts)}`);
  assert.deepEqual(pageErrors, [], `Browserfehler: ${JSON.stringify(pageErrors)}`);
  const result = { ok: true, askPosts, ttsPosts, results, persisted: { appointments: persisted.appointments.length, calls: persisted.calls.length, callbackThreads: persisted.callbackThreads.length }, external, blockedPosts, pageErrors };
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/homepage-negation-audit.json", `${JSON.stringify(result)}\n`);
  console.log(JSON.stringify(result));
} finally {
  await context.close();
  await browser.close();
}
