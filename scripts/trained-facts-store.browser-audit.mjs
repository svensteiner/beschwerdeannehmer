import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";

const bundles = await build({
  entryPoints: { store: "src/lib/alma/store.ts", repository: "src/lib/alma/trained-facts-repository.ts" },
  bundle: true, format: "esm", platform: "browser", write: false, outdir: "out",
});
const bundle = Object.fromEntries(bundles.outputFiles.map((file) => [file.path.endsWith("store.js") ? "store" : "repository", file.text]));
const server = createServer((request, response) => {
  if (request.url === "/store.js" || request.url === "/repository.js") {
    response.setHeader("content-type", "text/javascript");
    return response.end(request.url === "/store.js" ? bundle.store : bundle.repository);
  }
  response.setHeader("content-type", "text/html");
  response.end(request.url === "/blank" ? "" : '<script type="module">import * as store from "/store.js"; import * as facts from "/repository.js"; window.store = store; window.facts = facts;</script>');
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const blocked = [];
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    blocked.push(route.request().url()); return route.abort();
  });
  const seed = await context.newPage();
  await seed.goto(`${origin}/blank`);
  await seed.evaluate(() => localStorage.setItem("alma-ordination", JSON.stringify({
    state: { trainedFacts: ["Alter gemeinsamer Hinweis."], voiceId: "wien" }, version: 2,
  })));
  const [a, b] = await Promise.all([context.newPage(), context.newPage()]);
  await Promise.all([a.goto(origin), b.goto(origin)]);
  await Promise.all([a.waitForFunction(() => Boolean(window.store && window.facts)), b.waitForFunction(() => Boolean(window.store && window.facts))]);
  await Promise.all([a.evaluate(() => window.store.useAlmaStore.getState().hydrateTrainedFacts()), b.evaluate(() => window.store.useAlmaStore.getState().hydrateTrainedFacts())]);
  const added = await Promise.all([
    a.evaluate(() => window.store.useAlmaStore.getState().addTrainedFact("Regel aus Tab A.")),
    b.evaluate(() => window.store.useAlmaStore.getState().addTrainedFact("Regel aus Tab B.")),
  ]);
  assert.deepEqual(added, [true, true]);
  const corrected = await Promise.all([
    a.evaluate(() => window.store.useAlmaStore.getState().replaceTrainedFact("Alter gemeinsamer Hinweis.", "A korrigiert.")),
    b.evaluate(() => window.store.useAlmaStore.getState().replaceTrainedFact("Alter gemeinsamer Hinweis.", "B korrigiert.")),
  ]);
  assert.equal(corrected.filter(Boolean).length, 1, "Ein veralteter Korrekturwert darf nicht erneut gespeichert werden.");
  await a.evaluate(() => window.store.useAlmaStore.getState().setVoice("ara"));
  const reloaded = await context.newPage();
  await reloaded.goto(origin); await reloaded.waitForFunction(() => Boolean(window.store && window.facts));
  await reloaded.evaluate(() => window.store.useAlmaStore.getState().hydrateTrainedFacts());
  const facts = await reloaded.evaluate(() => window.store.useAlmaStore.getState().trainedFacts);
  assert.equal(facts.includes("Regel aus Tab A."), true);
  assert.equal(facts.includes("Regel aus Tab B."), true);
  assert.equal(facts.some((fact) => fact === "A korrigiert." || fact === "B korrigiert."), true);
  assert.equal(facts.includes("Alter gemeinsamer Hinweis."), false);
  assert.equal(await reloaded.evaluate(() => window.store.useAlmaStore.getState().removeTrainedFact("Regel aus Tab A.")), true);
  const afterDelete = await reloaded.evaluate(() => window.store.useAlmaStore.getState().trainedFacts);
  assert.equal(afterDelete.includes("Regel aus Tab A."), false);
  assert.equal(afterDelete.includes("Regel aus Tab B."), true);
  async function abortAction(method, ...args) {
    return reloaded.evaluate(async ({ method, args }) => {
      const before = [...window.store.useAlmaStore.getState().trainedFacts];
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...putArgs) {
        const request = original.apply(this, putArgs);
        this.transaction.abort();
        return request;
      };
      try { return { ok: await window.store.useAlmaStore.getState()[method](...args), before, after: window.store.useAlmaStore.getState().trainedFacts }; }
      finally { IDBObjectStore.prototype.put = original; }
    }, { method, args });
  }
  const retry = async (method, args) => reloaded.evaluate(({ method, args }) => window.store.useAlmaStore.getState()[method](...args), { method, args });
  for (const [method, args] of [
    ["addTrainedFact", ["Fehlerregel für Retry."]],
    ["replaceTrainedFact", ["Fehlerregel für Retry.", "Fehlerregel ersetzt."]],
    ["removeTrainedFact", ["Fehlerregel ersetzt."]],
  ]) {
    if (method === "replaceTrainedFact") assert.equal(await retry("addTrainedFact", ["Fehlerregel für Retry."]), true);
    const failed = await abortAction(method, ...args);
    assert.equal(failed.ok, false, `${method} muss bei Transaktionsabbruch fehlschlagen.`);
    assert.deepEqual(failed.after, failed.before, `${method} darf RAM nicht verändern.`);
    assert.deepEqual(await reloaded.evaluate(() => window.facts.initializeTrainedFacts([])), { ok: true, facts: failed.before }, `${method} darf die Datenbank nicht verändern.`);
    assert.equal(await retry(method, args), true, `${method} muss danach erneut möglich sein.`);
    const expected = method === "addTrainedFact"
      ? [args[0], ...failed.before]
      : method === "replaceTrainedFact"
        ? failed.before.map((fact) => fact === args[0] ? args[1] : fact)
        : failed.before.filter((fact) => fact !== args[0]);
    assert.deepEqual(await reloaded.evaluate(() => window.facts.initializeTrainedFacts([])), { ok: true, facts: expected }, `${method} muss beim Retry exakt schreiben.`);
  }
  const fillers = Array.from({ length: 38 }, (_, index) => `Zusatzregel ${index + 1} bleibt erhalten.`);
  assert.equal(await reloaded.evaluate((items) => Promise.all(items.map((item) => window.store.useAlmaStore.getState().addTrainedFact(item))), fillers).then((items) => items.every(Boolean)), true);
  assert.equal(await reloaded.evaluate(() => window.store.useAlmaStore.getState().trainedFacts.length), 40);
  assert.equal(await reloaded.evaluate(() => window.store.useAlmaStore.getState().addTrainedFact("Zusatzregel 1 bleibt erhalten.")), true, "Duplikat bleibt idempotent.");
  const beforeFortyFirst = await reloaded.evaluate(() => [...window.store.useAlmaStore.getState().trainedFacts]);
  assert.equal(await reloaded.evaluate(() => window.store.useAlmaStore.getState().addTrainedFact("Einundvierzigste Regel darf nichts verdrängen.")), false);
  assert.deepEqual(await reloaded.evaluate(() => window.store.useAlmaStore.getState().trainedFacts), beforeFortyFirst);
  assert.equal(await reloaded.evaluate(() => window.store.useAlmaStore.getState().removeTrainedFact("Zusatzregel 1 bleibt erhalten.")), true);
  assert.equal(await reloaded.evaluate(() => window.store.useAlmaStore.getState().addTrainedFact("Einundvierzigste Regel darf nichts verdrängen.")), true);
  assert.deepEqual(await reloaded.evaluate(() => window.store.useAlmaStore.getState().trainedFacts), [
    "Einundvierzigste Regel darf nichts verdrängen.",
    ...beforeFortyFirst.filter((fact) => fact !== "Zusatzregel 1 bleibt erhalten."),
  ]);
  assert.deepEqual(blocked, []);
  console.log(JSON.stringify({ ok: true, facts: await reloaded.evaluate(() => window.store.useAlmaStore.getState().trainedFacts) }));
  await context.close();
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
