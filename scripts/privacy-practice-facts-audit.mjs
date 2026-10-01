import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultSerovalPlugins } from "@tanstack/router-core";
import { fromCrossJSON, toJSONAsync } from "seroval";

const base = process.env.AUDIT_URL;
const root = process.env.AUDIT_BUILD_ROOT;
const tokenA = process.env.AUDIT_PRACTICE_A_TOKEN;
const tokenB = process.env.AUDIT_PRACTICE_B_TOKEN;
assert(base && root && tokenA && tokenB, "Isolierter Server und synthetische Sitzungen sind Pflicht.");
const url = new URL(base);
assert.equal(url.protocol, "http:");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.notEqual(url.port, "8092");
const runtime = await readFile(join(root, ".output/server/index.mjs"), "utf8");
const ids = new Map([...runtime.matchAll(/"([a-f0-9]{64})":\s*\{\s*functionName:\s*"([^"]+)"/g)].map(([, id, name]) => [name, id]));
const askId = ids.get("askAlma_createServerFn_handler");
const baseMatch = runtime.match(/SERVER_FN_BASE\s*=\s*"([^"]+)"/);
assert(askId && baseMatch, "askAlma oder SERVER_FN_BASE fehlt im isolierten Manifest.");
const endpoint = new URL(`${baseMatch[1]}${askId}`, url).toString();
assert.equal(new URL(endpoint).origin, url.origin);

async function ask({ token, demo, facts = [] }) {
  const payload = await toJSONAsync({
    data: {
      messages: [{ role: "user", content: "Was gilt bei Auditregel?" }],
      demo,
      facts,
    },
    context: {},
  }, { plugins: defaultSerovalPlugins });
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: {
      "content-type": "application/json",
      "x-tsr-serverfn": "true",
      origin: new URL(endpoint).origin,
      cookie: `silvia.session=${token}`,
    },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  const decoded = response.headers.get("x-tss-serialized") === "true"
    ? fromCrossJSON(body, { plugins: defaultSerovalPlugins })
    : body;
  return decoded?.result ?? decoded;
}

const A = "Auditregel A: nur am Vormittag.";
const B = "Auditregel B: nur nach Termin.";
const DEMO = "Auditregel: Demo-Wert.";
const demo = await ask({ token: tokenA, demo: true, facts: [DEMO] });
assert.equal(demo.source, "local");
assert.match(demo.text, /Demo-Wert/);
assert.doesNotMatch(demo.text, /Vormittag|nach Termin/);
const ordinary = await ask({ token: tokenA, demo: false, facts: [DEMO] });
assert.equal(ordinary.source, "local");
assert.match(ordinary.text, /Vormittag/);
assert.doesNotMatch(ordinary.text, /Demo-Wert|nach Termin/);
for (const demoFlag of ["true", "false", 1]) {
  const answer = await ask({ token: tokenA, demo: demoFlag, facts: [DEMO] });
  assert.equal(answer.source, "local");
  assert.match(answer.text, /Vormittag/, `demo=${String(demoFlag)} muss Praxis A bleiben.`);
  assert.doesNotMatch(answer.text, /Demo-Wert|nach Termin/);
}
const practiceB = await ask({ token: tokenB, demo: false, facts: [DEMO] });
assert.equal(practiceB.source, "local");
assert.match(practiceB.text, /nach Termin/);
assert.doesNotMatch(practiceB.text, /Vormittag|Demo-Wert/);
const result = { ok: true, requests: 6, demoPositiveControl: true, practiceA: A, practiceB: B, localOnly: true };
await writeFile(join("artifacts", "privacy-practice-facts-audit.json"), `${JSON.stringify(result)}\n`);
console.log(JSON.stringify(result));
