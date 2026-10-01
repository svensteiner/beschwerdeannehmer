import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
assert.equal(url.hostname, "127.0.0.1");
assert.notEqual(url.port, "8092");
const runtime = await readFile(join(root, ".output/server/index.mjs"), "utf8");
const ids = new Map([...runtime.matchAll(/"([a-f0-9]{64})":\s*\{\s*functionName:\s*"([^"]+)"/g)].map(([, id, name]) => [name, id]));
const transcribeId = ids.get("transcribeAlma_createServerFn_handler");
const baseMatch = runtime.match(/SERVER_FN_BASE\s*=\s*"([^"]+)"/);
assert(transcribeId && baseMatch, "transcribeAlma oder SERVER_FN_BASE fehlt im isolierten Manifest.");
const endpoint = new URL(`${baseMatch[1]}${transcribeId}`, url).toString();
assert.equal(new URL(endpoint).origin, url.origin);

async function transcribe({ token, demo, demoTerms = [] }) {
  const payload = await toJSONAsync({
    data: {
      audio: Buffer.alloc(256, 7).toString("base64"),
      mime: "audio/wav",
      demo,
      demoTerms,
    },
    context: {},
  }, { plugins: defaultSerovalPlugins });
  const response = await fetch(endpoint, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { "content-type": "application/json", "x-tsr-serverfn": "true", origin: new URL(endpoint).origin, cookie: `silvia.session=${token}` },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  const decoded = response.headers.get("x-tss-serialized") === "true"
    ? fromCrossJSON(body, { plugins: defaultSerovalPlugins }) : body;
  return decoded?.result ?? decoded;
}

for (const input of [
  { token: tokenA, demo: true, demoTerms: ["DemoWortAudit"] },
  { token: tokenA, demo: false, demoTerms: ["DemoWortAudit"] },
  { token: tokenB, demo: false, demoTerms: ["DemoWortAudit"] },
  { token: tokenA, demo: "true", demoTerms: ["DemoWortAudit"] },
]) {
  const result = await transcribe(input);
  assert.deepEqual(result, { ok: true, text: "synthetische erkennung" });
}
console.log(JSON.stringify({ ok: true, requests: 4, localMockTransportOnly: true }));
