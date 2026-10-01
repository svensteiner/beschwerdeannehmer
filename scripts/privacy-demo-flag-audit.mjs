import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultSerovalPlugins } from "@tanstack/router-core";
import { fromCrossJSON, toJSONAsync } from "seroval";

const base = process.env.AUDIT_URL;
const root = process.env.AUDIT_BUILD_ROOT;
assert(base && root, "Der Audit verlangt einen expliziten isolierten Server.");
const url = new URL(base);
assert.equal(url.protocol, "http:");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.notEqual(url.port, "8092");
const runtime = await readFile(join(root, ".output/server/index.mjs"), "utf8");
const ids = new Map([...runtime.matchAll(/"([a-f0-9]{64})":\s*\{\s*functionName:\s*"([^"]+)"/g)].map(([, id, name]) => [name, id]));
const askId = ids.get("askAlma_createServerFn_handler");
assert(askId, "askAlma fehlt im Produktionsmanifest der isolierten Kopie.");
const baseMatch = runtime.match(/SERVER_FN_BASE\s*=\s*"([^"]+)"/);
assert(baseMatch, "SERVER_FN_BASE fehlt im Produktionsmanifest.");
const endpoint = new URL(`${baseMatch[1]}${askId}`, url).toString();
assert.equal(new URL(endpoint).origin, url.origin, "Der Audit darf nur den lokalen Server ansprechen.");

async function ask(train) {
  const encoded = await toJSONAsync({
    data: {
      messages: [{ role: "user", content: "Wie sind die Öffnungszeiten?" }],
      demo: true,
      train,
    },
    context: {},
  }, { plugins: defaultSerovalPlugins });
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { "content-type": "application/json", "x-tsr-serverfn": "true", origin: new URL(endpoint).origin },
    body: JSON.stringify(encoded),
  });
  assert.equal(response.status, 200, `askAlma antwortet nicht: ${response.status}`);
  const body = await response.json();
  const decoded = response.headers.get("x-tss-serialized") === "true"
    ? fromCrossJSON(body, { plugins: defaultSerovalPlugins })
    : body;
  return decoded?.result ?? decoded;
}

const flags = [true, false, "true", "false", 1, 0, {}, null];
const results = [];
for (const flag of flags) {
  const answer = await ask(flag);
  assert.equal(answer?.source, "local", `Flag ${String(flag)} darf keinen Provider verwenden.`);
  const expectedTraining = flag === true;
  assert.equal(answer?.action?.type === "train", expectedTraining, `train=${String(flag)} wurde nicht strikt verarbeitet.`);
  if (expectedTraining) {
    assert.match(answer?.text ?? "", /Verstanden\b/i, "Trainingsantwort muss die Speicherung bestätigen.");
    assert.match(answer?.text ?? "", /Öffnungszeiten/i, "Trainingsantwort muss den trainierten Fakt thematisieren.");
    assert.match(answer?.action?.fact ?? "", /Öffnungszeiten/);
  } else {
    assert.match(answer?.text ?? "", /Unsere Zeiten/);
  }
  results.push({ flag, trainAction: answer.action.type, source: answer.source });
}
const result = { ok: true, requests: results.length, results, localOnly: true };
await writeFile(join("artifacts", "privacy-demo-flag-audit.json"), `${JSON.stringify(result)}\n`);
console.log(JSON.stringify(result));
