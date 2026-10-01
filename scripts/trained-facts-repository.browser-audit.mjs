import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";

const bundled = await build({
  entryPoints: ["src/lib/alma/trained-facts-repository.ts"], bundle: true, format: "esm", platform: "browser", write: false,
});
const source = bundled.outputFiles[0].text;
const server = createServer((request, response) => {
  if (request.url === "/repo.js") {
    response.setHeader("content-type", "text/javascript");
    return response.end(source);
  }
  response.setHeader("content-type", "text/html");
  response.end('<script type="module">import * as facts from "/repo.js"; window.facts = facts;</script>');
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const external = [];
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  const [a, b] = await Promise.all([context.newPage(), context.newPage()]);
  await Promise.all([a.goto(origin), b.goto(origin)]);
  await Promise.all([a.waitForFunction(() => Boolean(window.facts)), b.waitForFunction(() => Boolean(window.facts))]);
  const migrated = await a.evaluate(() => window.facts.initializeTrainedFacts([
    "Legacy-Hinweis bleibt exakt erhalten.", "Zweiter gültiger Altbestand bleibt in Reihenfolge.",
  ]));
  assert.deepEqual(migrated, { ok: true, facts: [
    "Legacy-Hinweis bleibt exakt erhalten.", "Zweiter gültiger Altbestand bleibt in Reihenfolge.",
  ] });
  const added = await Promise.all([
    a.evaluate(() => window.facts.mutateTrainedFacts((facts) => ["Regel aus Tab A.", ...facts])),
    b.evaluate(() => window.facts.mutateTrainedFacts((facts) => ["Regel aus Tab B.", ...facts])),
  ]);
  assert(added.every((result) => result.ok));
  const afterAdds = await a.evaluate(() => window.facts.initializeTrainedFacts(["stale legacy"]));
  assert.deepEqual(afterAdds.facts.sort(), ["Legacy-Hinweis bleibt exakt erhalten.", "Zweiter gültiger Altbestand bleibt in Reihenfolge.", "Regel aus Tab A.", "Regel aus Tab B."].sort());

  const replaced = await Promise.all([
    a.evaluate(() => window.facts.mutateTrainedFacts((facts) => facts.includes("Regel aus Tab A.") ? facts.map((fact) => fact === "Regel aus Tab A." ? "A korrigiert." : fact) : null)),
    b.evaluate(() => window.facts.mutateTrainedFacts((facts) => facts.includes("Regel aus Tab A.") ? facts.map((fact) => fact === "Regel aus Tab A." ? "B korrigiert." : fact) : null)),
  ]);
  assert.equal(replaced.filter((result) => result.ok).length, 1, "Nur eine Korrektur des gleichen Altwerts darf gewinnen.");
  const afterReplace = await a.evaluate(() => window.facts.initializeTrainedFacts(["alte lokale Kopie"]));
  assert.equal(afterReplace.facts.includes("Regel aus Tab B."), true);
  assert.equal(afterReplace.facts.includes("Regel aus Tab A."), false);
  assert.equal(afterReplace.facts.some((fact) => fact === "A korrigiert." || fact === "B korrigiert."), true);

  await a.evaluate(() => localStorage.setItem("alma-ordination", JSON.stringify({ state: { voiceId: "ara", trainedFacts: ["stale legacy"] } })));
  const reloaded = await context.newPage();
  await reloaded.goto(origin);
  await reloaded.waitForFunction(() => Boolean(window.facts));
  const afterOtherStoreWrite = await reloaded.evaluate(() => window.facts.initializeTrainedFacts(["stale legacy"]));
  assert.deepEqual(afterOtherStoreWrite.facts, afterReplace.facts, "Fremder Store-Write darf Fakten nicht überschreiben.");
  assert.deepEqual(external, [], "Der isolierte Browser-Test ruft keine externen Ziele auf.");
  console.log(JSON.stringify({ ok: true, facts: afterReplace.facts }));
  await context.close();

  const edgeContext = await browser.newContext();
  const edgeExternal = [];
  await edgeContext.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    edgeExternal.push(route.request().url());
    return route.abort();
  });
  const edge = await edgeContext.newPage();
  await edge.goto(origin);
  await edge.waitForFunction(() => Boolean(window.facts));
  await edge.evaluate((name) => new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  }), "alma-trained-facts");
  const emptyWins = await edge.evaluate(async () => [
    await window.facts.initializeTrainedFacts([]),
    await window.facts.initializeTrainedFacts(["Legacy darf nicht erneut importiert werden."]),
  ]);
  assert.deepEqual(emptyWins, [{ ok: true, facts: [] }, { ok: true, facts: [] }]);
  await edge.evaluate((name) => new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  }), "alma-trained-facts");
  assert.deepEqual(await edge.evaluate(() => window.facts.initializeTrainedFacts(["kurz"])), { ok: false });
  const beforeAbort = await edge.evaluate(() => window.facts.initializeTrainedFacts(["Altbestand vor Abbruch."]));
  assert.deepEqual(beforeAbort, { ok: true, facts: ["Altbestand vor Abbruch."] });
  const aborted = await edge.evaluate(async () => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      this.transaction.abort();
      return request;
    };
    try { return await window.facts.mutateTrainedFacts((facts) => ["Darf nicht bleiben.", ...facts]); }
    finally { IDBObjectStore.prototype.put = original; }
  });
  assert.deepEqual(aborted, { ok: false });
  assert.deepEqual(await edge.evaluate(() => window.facts.initializeTrainedFacts([])), beforeAbort);
  assert.deepEqual(await edge.evaluate(() => window.facts.mutateTrainedFacts((facts) => ["Retry bleibt einmalig.", ...facts])), {
    ok: true, facts: ["Retry bleibt einmalig.", "Altbestand vor Abbruch."],
  });
  assert.deepEqual(edgeExternal, []);
  await edgeContext.close();
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
