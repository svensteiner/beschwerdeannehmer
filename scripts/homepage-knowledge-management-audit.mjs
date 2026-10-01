// Isolierter Browser-Audit fuer die Demo-Regelverwaltung: nur synthetischer Browser-Speicher.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.AUDIT_URL;
assert(base, "AUDIT_URL muss die bewusst gestartete lokale Audit-URL enthalten.");
const url = new URL(base);
assert.equal(url.protocol, "http:");
assert.equal(url.hostname, "127.0.0.1");
assert.notEqual(url.port, "8092");
assert(process.env.AUDIT_BUILD_ROOT, "AUDIT_BUILD_ROOT muss die isolierte Tempkopie benennen.");

const oldest = "Parkplätze befinden sich vor dem Haus.";
const newer = "Parkplätze befinden sich hinter dem Haus.";
const facts = [
  newer,
  "Impfungen nur vormittags.",
  "Kastrationen bitte mittwochs.",
  "Rezeptabholung am Empfang.",
  "Röntgen nur nach Termin.",
  "Die ausführliche Information zur stationären Aufnahme erhalten Halterinnen am Empfang.",
  oldest,
];
const others = facts.filter((fact) => fact !== oldest);
const origin = url.origin;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
const unexpectedExternal = [];
const localFontResponses = [];
let blockedPosts = 0;
const browserErrors = [];

await context.addInitScript(({ seededFacts }) => {
  const seedKey = "silvia-audit-knowledge-seeded";
  const nativeSetItem = Storage.prototype.setItem;
  if (sessionStorage.getItem(seedKey) !== "1") {
    nativeSetItem.call(localStorage, "alma-ordination", JSON.stringify({
      state: { trainedFacts: seededFacts }, version: 2,
    }));
    sessionStorage.setItem(seedKey, "1");
  }
  window.__auditArmDeleteFailure = false;
  const nativePut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === "facts" && window.__auditArmDeleteFailure) {
      window.__auditArmDeleteFailure = false;
      const request = nativePut.apply(this, args);
      this.transaction.abort();
      return request;
    }
    return nativePut.apply(this, args);
  };
}, { seededFacts: facts });

await context.route("**/*", async (route) => {
  const request = route.request();
  const requestUrl = new URL(request.url());
  if (requestUrl.origin !== origin) {
    unexpectedExternal.push({ method: request.method(), origin: requestUrl.origin, path: requestUrl.pathname });
    return route.abort();
  }
  if (request.method() !== "GET") {
    blockedPosts += 1;
    return route.abort();
  }
  return route.continue();
});

async function waitForTraining(page) {
  await page.waitForFunction(() => {
    const button = document.querySelector("#sprechen-mode-trainieren");
    const props = Object.keys(button ?? {}).find((key) => key.startsWith("__reactProps$"));
    return Boolean(props && typeof button[props]?.onClick === "function");
  });
  await page.locator("#sprechen-mode-trainieren").click();
  await page.locator("#sprechen-training-wissen").click();
  await page.getByRole("list", { name: "Gelernte Praxisregeln" }).waitFor();
}

async function storedFacts(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("alma-trained-facts", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("facts", "readonly");
      const read = transaction.objectStore("facts").get("current");
      read.onsuccess = () => { db.close(); resolve(read.result?.facts ?? []); };
      read.onerror = () => { db.close(); reject(read.error); };
    };
  }));
}

try {
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("response", (response) => {
    const responseUrl = new URL(response.url());
    if (responseUrl.origin === origin && responseUrl.pathname.endsWith(".woff2")) {
      localFontResponses.push({ path: responseUrl.pathname, status: response.status() });
    }
  });
  await page.goto(`${base}/#anrufen`, { waitUntil: "domcontentloaded" });
  await waitForTraining(page);
  const staleTab = await context.newPage();
  await staleTab.addInitScript(() => { Object.defineProperty(window, "BroadcastChannel", { configurable: true, value: undefined }); });
  staleTab.on("pageerror", (error) => browserErrors.push(error.message));
  await staleTab.goto(`${base}/#anrufen`, { waitUntil: "domcontentloaded" });
  await waitForTraining(staleTab);
  const loadedFonts = await page.evaluate(async () => {
    const checks = [
      ["normal 400 16px 'Figtree Variable'", "Figtree Variable"],
      ["italic 400 16px 'Figtree Variable'", "Figtree Variable"],
      ["normal 500 16px 'Fraunces Variable'", "Fraunces Variable"],
      ["italic 500 16px 'Fraunces Variable'", "Fraunces Variable"],
    ];
    await Promise.all(checks.map(([font]) => document.fonts.load(font, "Silvia")));
    return checks.map(([font, family]) => ({ font, loaded: document.fonts.check(font, "Silvia"), family }));
  });
  assert.deepEqual(loadedFonts.map(({ loaded }) => loaded), [true, true, true, true], `Lokale Schriften wurden nicht geladen: ${JSON.stringify(loadedFonts)}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Die Regelverwaltung darf bei 320px nicht horizontal überlaufen.");
  const list = page.getByRole("list", { name: "Gelernte Praxisregeln" });
  const initialVisibleFacts = await list.getByRole("listitem").allTextContents();
  const initialStoredFacts = await storedFacts(page);
  assert.equal(initialStoredFacts.length, facts.length, `Der synthetische Speicher enthielt nicht alle Regeln: ${JSON.stringify(initialStoredFacts)}`);
  assert.equal(initialVisibleFacts.length, facts.length, `Alle gespeicherten Demo-Regeln müssen zugänglich sein: ${JSON.stringify(initialVisibleFacts)}`);
  const deleteOldest = page.getByRole("button", { name: `${oldest} löschen`, exact: true });
  await deleteOldest.scrollIntoViewIfNeeded();
  assert.equal(await deleteOldest.isVisible(), true, "Der Löschknopf der ältesten Regel ist nicht erreichbar.");

  await page.evaluate(() => { window.__auditArmDeleteFailure = true; });
  await deleteOldest.click();
  await page.getByText("Demo-Hinweis konnte nicht gelöscht werden.", { exact: true }).waitFor();
  assert.equal((await storedFacts(page)).includes(oldest), true, "Ein echter Speicherfehler darf die Regel nicht entfernen.");
  assert.equal(await list.getByRole("listitem").count(), facts.length, "Nach fehlgeschlagenem Löschen müssen alle Regeln sichtbar bleiben.");

  await deleteOldest.click();
  await page.waitForFunction((fact) => new Promise((resolve) => {
    const request = indexedDB.open("alma-trained-facts", 1);
    request.onsuccess = () => {
      const db = request.result; const read = db.transaction("facts", "readonly").objectStore("facts").get("current");
      read.onsuccess = () => { db.close(); resolve(!read.result?.facts.includes(fact)); };
    };
  }), oldest);
  assert.equal(await list.getByRole("listitem").count(), others.length, "Der Retry darf nur die gewählte Regel entfernen.");
  assert.deepEqual(await storedFacts(page), others);

  const staleRule = facts[1];
  assert.equal(await staleTab.getByRole("list", { name: "Gelernte Praxisregeln" }).getByRole("listitem").count(), facts.length, "Tab B muss vor seiner Aktion noch die alte Regelansicht haben.");
  const deleteFromStaleTab = staleTab.getByRole("button", { name: `${staleRule} löschen`, exact: true });
  await deleteFromStaleTab.click();
  const afterTwoTabs = others.filter((fact) => fact !== staleRule);
  await staleTab.waitForFunction((expected) => new Promise((resolve) => {
    const open = indexedDB.open("alma-trained-facts", 1);
    open.onsuccess = () => { const db = open.result; const get = db.transaction("facts", "readonly").objectStore("facts").get("current"); get.onsuccess = () => { db.close(); resolve(JSON.stringify(get.result?.facts ?? []) === JSON.stringify(expected)); }; };
  }), afterTwoTabs);
  assert.deepEqual(await storedFacts(page), afterTwoTabs, "Ein stale Tab darf die vorherige Löschung nicht wiederherstellen.");

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForTraining(page);
  assert.deepEqual(await storedFacts(page), afterTwoTabs, "Nach Reload müssen nur die übrigen Regeln erhalten bleiben.");
  assert.equal(await list.getByRole("listitem").count(), afterTwoTabs.length, "Nach Reload müssen alle übrigen Regeln sichtbar zugänglich sein.");
  assert.equal(await page.getByRole("button", { name: `${oldest} löschen`, exact: true }).count(), 0, "Die gelöschte älteste Regel darf nach Reload keinen Löschknopf mehr haben.");
  await page.locator("#sprechen-training-sprache").click();
  assert.equal(await page.getByRole("list", { name: "Gelernte Praxisregeln" }).count(), 0, "Sprachtraining darf keine Praxisregeln zeigen.");

  assert.deepEqual(unexpectedExternal, [], `Der lokale Produktionsaudit darf keine externen Requests auslösen: ${JSON.stringify(unexpectedExternal)}`);
  assert(localFontResponses.length >= 4 && localFontResponses.every(({ status }) => status === 200), `Lokale Font-Dateien müssen mit HTTP 200 antworten: ${JSON.stringify(localFontResponses)}`);
  assert.equal(blockedPosts, 0, "Der Audit darf keine Server-Schreibaufrufe auslösen.");
  assert.deepEqual(browserErrors, [], "Der Audit darf keine JavaScript-Fehler erzeugen.");

  const result = { ok: true, seededFacts: facts.length, remainingFacts: afterTwoTabs.length, retryRemovedOnlySelected: true, twoTabNoRestore: true, compactNoOverflow: true, loadedFonts, localFontResponses, unexpectedExternal, blockedPosts, browserErrors };
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/homepage-knowledge-management-audit.json", `${JSON.stringify(result)}\n`);
  console.log(JSON.stringify(result));
} finally {
  await context.close();
  await browser.close();
}
