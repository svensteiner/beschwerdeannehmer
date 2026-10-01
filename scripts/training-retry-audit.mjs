// Isolierter UI-Regressionsaudit fuer die echte SprechenCall-Komponente.
// Keine echten Mikrofon-, Praxis- oder kostenpflichtigen API-Aufrufe.
import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const base = process.env.AUDIT_URL;
assert(base, "AUDIT_URL muss die bewusst gestartete lokale Audit-URL enthalten.");
const parsedBase = new URL(base);
assert.equal(parsedBase.protocol, "http:", "AUDIT_URL muss eine lokale http-URL sein.");
assert(["127.0.0.1", "localhost"].includes(parsedBase.hostname), "AUDIT_URL muss auf localhost oder 127.0.0.1 zeigen.");
assert.notEqual(parsedBase.port, "8092", "Dieser Audit verwendet niemals Port 8092.");
const origin = parsedBase.origin;
const suppliedBuildRoot = process.env.AUDIT_BUILD_ROOT;
assert(suppliedBuildRoot, "AUDIT_BUILD_ROOT muss eine explizite isolierte Build-Kopie enthalten.");
const buildRoot = await realpath(resolve(suppliedBuildRoot));

function serverFnMap(runtime) {
  return new Map([...runtime.matchAll(/"([a-f0-9]{64})":\s*\{\s*functionName:\s*"([^"]+)"/g)]
    .map(([, id, name]) => [id, name]));
}
const serverFns = serverFnMap(await readFile(join(buildRoot, ".output", "server", "index.mjs"), "utf8"));
const SPEAK_SERVER_FN = "speakAlma_createServerFn_handler";
const TRANSCRIBE_SERVER_FN = "transcribeAlma_createServerFn_handler";
assert([...serverFns.values()].includes(SPEAK_SERVER_FN), "Die isolierte Build-Kopie enthält keine speakAlma-Serverfunktion.");
assert([...serverFns.values()].includes(TRANSCRIBE_SERVER_FN), "Die isolierte Build-Kopie enthält keine transcribeAlma-Serverfunktion.");
function serverFnName(url) {
  const id = new URL(url).pathname.split("/").pop() || "";
  if (serverFns.has(id)) return serverFns.get(id);
  // Vite verwendet einen lesbaren Base64-JSON-Descriptor. Auch dort werden
  // nur exakte export-Namen akzeptiert, keine Teiltext-Heuristiken.
  try {
    const data = JSON.parse(Buffer.from(id, "base64url").toString("utf8"));
    return typeof data?.export === "string" ? data.export : "";
  } catch {
    return "";
  }
}
const homepageEntry = process.env.AUDIT_ENTRY === "homepage";
const evidence = await mkdtemp(join(tmpdir(), "silvia-training-retry-"));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
let blockedPosts = 0;
let mockedStt = 0;
const trace = { recorderStart: 0, recorderData: 0, recorderStop: 0, serverFns: [] };

// Der STT-Pfad wird lokal und kontrolliert gemockt; weder Mikrofon noch
// Browser-Spracherkennung oder externe Dienste werden verwendet.
await context.addInitScript(() => {
  window.__silviaAuditTrace = { recorderStart: 0, recorderData: 0, recorderStop: 0 };
  // Ein kurzer Fake-Recorder liefert die kontrollierte STT-Antwort.
  const track = { readyState: "live", stop() { this.readyState = "ended"; } };
  const stream = { getTracks: () => [track] };
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: async () => stream },
  });
  class FakeMediaRecorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = "inactive"; }
    start() { this.state = "recording"; window.__silviaAuditTrace.recorderStart += 1; }
    stop() {
      this.state = "inactive";
      window.__silviaAuditTrace.recorderData += 1;
      this.ondataavailable?.({ data: new Blob([new Uint8Array(5000)], { type: "audio/webm" }) });
      window.__silviaAuditTrace.recorderStop += 1;
      this.onstop?.();
    }
    abort() { this.stop(); }
  }
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
  Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined });
});

// Catch-all zuerst registrieren; gezielte Route wird danach hinzugefuegt,
// weil Playwright Routen in LIFO-Reihenfolge auswertet.
await context.route("**/*", async (route) => {
  const request = route.request();
  if (new URL(request.url()).origin !== origin || request.method() === "POST") {
    if (request.method() === "POST") blockedPosts += 1;
    return route.abort();
  }
  return route.continue();
});
await context.route("**/api/stimme/hoeren", async (route) => {
  if (new URL(route.request().url()).origin !== origin) return route.abort();
  if (route.request().method() !== "POST") return route.continue();
  mockedStt += 1;
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, text: "Röntgen" }),
  });
});
await context.route("**/_serverFn/**", async (route) => {
  const url = route.request().url();
  const encoded = url.split("/").pop() || "";
  if (new URL(url).origin !== origin) return route.abort();
  const name = serverFnName(url);
  trace.serverFns.push({ method: route.request().method(), id: encoded.slice(0, 96), name });
  if (route.request().method() !== "POST") return route.continue();
  if (name === SPEAK_SERVER_FN) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: false }),
    });
  }
  if (name === TRANSCRIBE_SERVER_FN) {
    mockedStt += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: { ok: true, text: "Röntgen" } }),
    });
  }
  if (route.request().method() === "POST") blockedPosts += 1;
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
  page.setDefaultTimeout(15_000);
  await page.addInitScript(() => {
    localStorage.setItem("alma-ordination", JSON.stringify({
      state: { trainedFacts: ["Praxisregel bleibt erhalten"] },
      version: 2,
    }));
  });
  await page.goto(homepageEntry ? `${base}/` : `${base}/sprechen?training=sprache`);
  if (homepageEntry) {
    await page.locator("#sprechen-mode-trainieren").click();
    await page.locator("#sprechen-training-sprache").waitFor();
    await page.locator("#sprechen-training-sprache").click();
    assert.equal(await page.locator("#sprechen-training-sprache").getAttribute("aria-pressed"), "true");
    await page.waitForFunction(() => document.querySelector("#sprechen-anrufen")?.textContent?.includes("Schulung starten"));
  }
  const initialAlmaStorage = await page.evaluate(() => localStorage.getItem("alma-ordination"));
  await page.locator("#sprechen-anrufen").click();
  await page.getByRole("button", { name: "Stimme aus" }).click();

  // Der lokale STT-Mock erzeugt die echte letzte User-Blase samt
  // Korrigieren-Button.
  const firstSpeak = page.getByRole("button", { name: "Sprechen", exact: true });
  if (await firstSpeak.count()) await firstSpeak.click();
  await page.getByRole("button", { name: "Fertig", exact: true }).click();
  const correct = page.getByRole("button", { name: "Korrigieren", exact: true });
  await correct.waitFor({ timeout: 10_000 }).catch(async () => {
    Object.assign(trace, await page.evaluate(() => window.__silviaAuditTrace));
    console.log(JSON.stringify({ trace, mockedStt, blockedPosts }));
    console.log((await page.locator("body").innerText()).slice(-900));
    throw new Error("Fake-STT hat keine Korrigieren-Schaltfläche erzeugt");
  });
  assert.equal(await page.locator("input").first().inputValue(), "", "Eingabe vor Korrektur muss leer sein");
  assert.match(await page.locator("body").innerText(), /Röntgen/);

  await page.locator("#hoer-korrigieren").click();
  const input = page.locator("input").first();
  await input.fill("");
  await input.pressSequentially("Röntgenaufnahme");

  // Erster lokaler Speicherversuch scheitert absichtlich. Der Text im
  // Editfeld und die Original-Blase muessen fuer den Retry erhalten bleiben.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.__silviaFailSpeechSave = true;
    Storage.prototype.setItem = function (key, value) {
      if (window.__silviaFailSpeechSave && key === "silvia.demo-speech-terms.v1") {
        window.__silviaFailSpeechSave = false;
        throw new Error("controlled localStorage failure");
      }
      return original.call(this, key, value);
    };
  });
  const submit = input.locator("xpath=ancestor::form").locator("button[type=submit]");
  await page.waitForFunction(() => document.querySelector("input")?.value === "Röntgenaufnahme");
  await page.waitForTimeout(100);
  await page.waitForFunction(() => {
    const field = document.querySelector("input");
    const button = field?.closest("form")?.querySelector("button[type=submit]");
    return button instanceof HTMLButtonElement && !button.disabled;
  }).catch(async () => {
    console.log(`UI bleibt deaktiviert: ${await submit.isDisabled()}, input=${await input.inputValue()}`);
    throw new Error("Korrektur-Submit wurde nach lokalem Fehler nicht wieder aktiviert");
  });
  await submit.click();
  await page.getByText(/Browser konnte den Fachbegriff nicht speichern/).waitFor();
  assert.equal(await input.inputValue(), "Röntgenaufnahme", "Fehlgeschlagene Korrektur muss Edittext behalten");
  assert.ok(
    await page.locator("div.alma-rise").evaluateAll((els) =>
      els.filter((el) => {
        const text = el.textContent?.trim() ?? "";
        return text.startsWith("Röntgen") && !text.includes("Röntgenaufnahme");
      }).length,
    ),
    "Original muss sichtbar bleiben",
  );

  // Derselbe sichtbare Edittext wird erneut gesendet und muss nun gelingen.
  await page.waitForFunction(() => {
    const field = document.querySelector("input");
    const button = field?.closest("form")?.querySelector("button[type=submit]");
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  await submit.click();
  await page.getByText(/Fachbegriff korrigiert/).waitFor();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("silvia.demo-speech-terms.v1"))), ["Röntgenaufnahme"]);
  assert.equal(await page.evaluate(() => localStorage.getItem("alma-ordination")), initialAlmaStorage, "Sprachkorrektur darf Praxiswissen-Storage nicht verändern");
  assert.equal(await input.inputValue(), "", "Erfolgreicher Retry muss Edittext leeren");
  assert.match(await page.locator("body").innerText(), /Röntgenaufnahme/);

  // Sprachtraining und Praxiswissen bleiben getrennt: gespeicherter
  // Sprachbegriff erscheint nicht als Wissenstraining-Hinweis.
  await page.locator("#sprechen-training-beenden").click();
  await page.getByText(/Gespräch beendet ·/).waitFor();
  await page.locator("#sprechen-training-wissen").click();
  assert.equal(await page.locator("#sprechen-training-wissen").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("#sprechen-training-sprache").getAttribute("aria-pressed"), "false");
  assert.deepEqual(
    await storedFacts(page),
    ["Praxisregel bleibt erhalten"],
  );
  assert.equal(await page.getByText("Röntgenaufnahme", { exact: true }).count(), 0);
  if (homepageEntry) {
    await page.locator("#sprechen-mode-anrufen").click();
    assert.equal(await page.locator("#sprechen-training-wissen").isHidden(), true, "Training muss nach Rückwechsel verborgen sein");
    await page.locator("#sprechen-mode-trainieren").click();
    await page.locator("#sprechen-training-sprache").click();
    assert.equal(await page.locator("#sprechen-training-sprache").getAttribute("aria-pressed"), "true");
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("silvia.demo-speech-terms.v1"))), ["Röntgenaufnahme"]);
  }
  assert.ok(mockedStt >= 1, "Der lokale STT-Mock wurde nicht verwendet.");
  assert.equal(blockedPosts, 0, `Unerwartete POST-Anfragen blockiert: ${blockedPosts}`);
  const result = { ok: true, homepageEntry, mockedStt, blockedPosts, evidence };
  await writeFile(join(evidence, "audit.json"), `${JSON.stringify(result)}\n`, "utf8");
  console.log(`PASS: echter Trainings-UI-Retry, Edittext/Original erhalten, Retry erfolgreich, Sprachtraining und Praxiswissen getrennt, ${mockedStt} STT-Mock(s), 0 fremde/unerlaubte POSTs. EVIDENCE: ${evidence}`);
} finally {
  await context.close();
  await browser.close();
}
