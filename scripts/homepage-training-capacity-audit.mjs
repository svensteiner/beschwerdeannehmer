// Isolierter Browser-Audit: eine volle Demo-Regelliste darf keine alte Regel verdrängen.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { defaultSerovalPlugins } from "@tanstack/router-core";
import { fromCrossJSON } from "seroval";

const base = process.env.AUDIT_URL;
assert(base, "AUDIT_URL muss die lokale Audit-URL enthalten.");
const url = new URL(base);
assert.equal(url.protocol, "http:");
assert.equal(url.hostname, "127.0.0.1");
assert.notEqual(url.port, "8092");
const root = process.env.AUDIT_BUILD_ROOT;
assert(root, "AUDIT_BUILD_ROOT muss die isolierte Tempkopie benennen.");
const origin = url.origin;
const initialFacts = Array.from({ length: 40 }, (_, index) => `Kapazitätsregel ${index + 1}: bleibt erhalten.`);
const removedFact = initialFacts.at(-1);
const retryFact = "Die neue Kapazitätsregel wird erst nach dem Löschen gespeichert.";

const runtime = await readFile(join(root, ".output", "server", "index.mjs"), "utf8");
const serverFns = new Map([...runtime.matchAll(/"([a-f0-9]{64})":\s*\{\s*functionName:\s*"([^"]+)"/g)]
  .map(([, id, name]) => [id, name]));
assert([...serverFns.values()].includes("askAlma_createServerFn_handler"), "askAlma fehlt im isolierten Produktionsmanifest.");
assert([...serverFns.values()].includes("speakAlma_createServerFn_handler"), "speakAlma fehlt im isolierten Produktionsmanifest.");
function serverFnName(request) {
  return serverFns.get(new URL(request.url()).pathname.split("/").pop() || "") || "";
}
async function decode(response) {
  const body = await response.json();
  return response.headers()["x-tss-serialized"] === "true"
    ? fromCrossJSON(body, { plugins: defaultSerovalPlugins })
    : body;
}
async function waitForTrainingControl(page) {
  await page.waitForFunction(() => {
    const button = document.querySelector("#sprechen-mode-trainieren");
    const props = Object.keys(button ?? {}).find((key) => key.startsWith("__reactProps$"));
    return Boolean(props && typeof button[props]?.onClick === "function");
  });
}
async function chooseKnowledgeTraining(page) {
  await page.locator("#sprechen-mode-trainieren").click();
  await page.locator("#sprechen-training-wissen").click();
  await page.getByRole("list", { name: "Gelernte Praxisregeln" }).waitFor();
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
const unexpectedExternal = [];
const browserErrors = [];
let askPosts = 0;
let blockedPosts = 0;

await context.addInitScript((facts) => {
  const seedKey = "silvia-audit-capacity-seeded";
  if (sessionStorage.getItem(seedKey) !== "1") {
    localStorage.setItem("alma-ordination", JSON.stringify({ state: { trainedFacts: facts }, version: 2 }));
    sessionStorage.setItem(seedKey, "1");
  }
  const track = { readyState: "live", stop() { this.readyState = "ended"; } };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [track] }) } });
  class FakeMediaRecorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = "inactive"; }
    start() { this.state = "recording"; }
    stop() { if (this.state === "recording") { this.state = "inactive"; this.onstop?.(); } }
  }
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
  Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined });
  Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: undefined });
}, initialFacts);

await context.route("**/*", async (route) => {
  const request = route.request();
  const requestUrl = new URL(request.url());
  if (requestUrl.origin !== origin) {
    unexpectedExternal.push({ method: request.method(), origin: requestUrl.origin, path: requestUrl.pathname });
    return route.abort();
  }
  if (request.method() !== "POST") return route.continue();
  const name = serverFnName(request);
  if (name === "askAlma_createServerFn_handler") {
    askPosts += 1;
    return route.continue();
  }
  if (name === "speakAlma_createServerFn_handler") {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false }) });
  }
  blockedPosts += 1;
  return route.abort();
});

async function storedFacts(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("alma-trained-facts", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result; const get = db.transaction("facts", "readonly").objectStore("facts").get("current");
      get.onsuccess = () => { db.close(); resolve(get.result?.facts ?? []); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  }));
}

try {
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto(`${base}/#anrufen`, { waitUntil: "domcontentloaded" });
  await waitForTrainingControl(page);
  await chooseKnowledgeTraining(page);
  const list = page.getByRole("list", { name: "Gelernte Praxisregeln" });
  assert.equal(await list.getByRole("listitem").count(), 40, "Alle 40 gespeicherten Regeln müssen sichtbar sein.");

  async function startTrainingWithRetainedInput() {
    await page.locator("#sprechen-anrufen").click();
    await page.locator("#sprechen-training-beenden").waitFor();
    const input = page.locator("form input").first();
    await input.waitFor();
    const finish = page.getByRole("button", { name: "Fertig", exact: true });
    await finish.waitFor();
    await finish.click();
    return input;
  }

  const input = await startTrainingWithRetainedInput();
  await input.fill(retryFact);
  const firstAsk = page.waitForResponse((response) => response.request().method() === "POST" && serverFnName(response.request()) === "askAlma_createServerFn_handler");
  await input.locator("xpath=ancestor::form").getByRole("button", { name: "Senden", exact: true }).click();
  const firstDecoded = await decode(await firstAsk);
  const firstResult = firstDecoded?.result ?? firstDecoded;
  assert.equal(firstResult?.source, "local", "Die echte Trainingsantwort muss lokal bleiben.");
  assert(firstResult?.text, "Die lokale Trainingsantwort enthält keinen Text.");
  const capacityError = "40 Demo-Hinweise gespeichert. Beenden Sie das Gespräch und löschen Sie zuerst einen nicht mehr benötigten Hinweis.";
  await page.locator('[data-line-role="assistant"]', { hasText: capacityError }).waitFor();
  assert.equal((await page.locator('[data-line-role="assistant"]').allTextContents()).at(-1), capacityError, "Die Kapazitätsablehnung darf keine frühere Speicherbestätigung stehen lassen.");
  assert.equal(await input.inputValue(), retryFact, "Die abgelehnte Eingabe muss erhalten bleiben.");
  assert.deepEqual(await storedFacts(page), initialFacts, "Die volle Liste darf keine Regel verlieren.");
  assert.equal(await page.locator('[data-line-role="assistant"]', { hasText: "Demo-Hinweis sichtbar" }).count(), 0, "Der volle Speicher darf keinen Erfolgsnachweis zeigen.");

  await page.locator("#sprechen-training-beenden").click();
  const deleteRemoved = page.getByRole("button", { name: `${removedFact} löschen`, exact: true });
  await deleteRemoved.click();
  await page.waitForFunction((fact) => new Promise((resolve) => {
    const open = indexedDB.open("alma-trained-facts", 1); open.onsuccess = () => { const db = open.result; const get = db.transaction("facts", "readonly").objectStore("facts").get("current"); get.onsuccess = () => { db.close(); resolve(!get.result?.facts.includes(fact)); }; };
  }), removedFact);
  // The IndexedDB transaction can complete before React has rendered the new
  // snapshot. Wait for the committed state to reach the visible list as well.
  await page.waitForFunction((fact) => {
    const list = document.querySelector('[aria-label="Gelernte Praxisregeln"]');
    if (!list) return false;
    const items = [...list.querySelectorAll("li")];
    return items.length === 39 && !items.some((item) => item.textContent?.includes(fact));
  }, removedFact);
  assert.equal(await list.getByRole("listitem").count(), 39, "Das Löschen muss genau einen Platz freigeben.");

  const retryInput = await startTrainingWithRetainedInput();
  assert.equal(await retryInput.inputValue(), retryFact, "Nach Auflegen und Neubeginn darf kein erneutes Tippen nötig sein.");
  const retryAsk = page.waitForResponse((response) => response.request().method() === "POST" && serverFnName(response.request()) === "askAlma_createServerFn_handler");
  await retryInput.locator("xpath=ancestor::form").getByRole("button", { name: "Senden", exact: true }).click();
  const retryDecoded = await decode(await retryAsk);
  const retryResult = retryDecoded?.result ?? retryDecoded;
  assert.equal(retryResult?.source, "local", "Der Retry muss ebenfalls die lokale Trainingsantwort nutzen.");
  assert(retryResult?.text, "Die lokale Retry-Antwort enthält keinen Text.");
  await page.waitForFunction((fact) => new Promise((resolve) => {
    const open = indexedDB.open("alma-trained-facts", 1); open.onsuccess = () => { const db = open.result; const get = db.transaction("facts", "readonly").objectStore("facts").get("current"); get.onsuccess = () => { db.close(); resolve(get.result?.facts.includes(fact)); }; };
  }), retryFact);
  const afterRetry = await storedFacts(page);
  const expectedAfterRetry = [retryFact, ...initialFacts.filter((fact) => fact !== removedFact)];
  assert.equal(afterRetry.length, 40);
  assert.deepEqual(afterRetry, expectedAfterRetry, "Der Retry darf nur die gelöschte Regel ersetzen.");

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForTrainingControl(page);
  await chooseKnowledgeTraining(page);
  assert.deepEqual(await storedFacts(page), expectedAfterRetry, "Nach Reload müssen exakt die 39 übrigen und die neue Regel bleiben.");
  assert.equal(await page.getByRole("list", { name: "Gelernte Praxisregeln" }).getByRole("listitem").count(), 40);
  assert.equal(askPosts, 2, "Nur die zwei echten lokalen Trainingsanfragen sind erlaubt.");
  assert.deepEqual(unexpectedExternal, [], `Keine externen Requests erlaubt: ${JSON.stringify(unexpectedExternal)}`);
  assert.equal(blockedPosts, 0, "Keine unbekannten POSTs erlaubt.");
  assert.deepEqual(browserErrors, [], "Keine JavaScript-Fehler erlaubt.");

  const result = { ok: true, initialFacts: 40, remainingAfterDelete: 39, retrySaved: true, askPosts, unexpectedExternal, blockedPosts, browserErrors };
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/homepage-training-capacity-audit.json", `${JSON.stringify(result)}\n`);
  console.log(JSON.stringify(result));
} finally {
  await context.close();
  await browser.close();
}
