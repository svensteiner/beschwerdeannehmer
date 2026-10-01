// Opt-in Standalone-Audit; default smoke behavior remains unchanged.
import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { createConnection } from "node:net";
import { request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { defaultSerovalPlugins } from "@tanstack/router-core";
import { fromCrossJSON, toJSONAsync } from "seroval";

const host = "127.0.0.1";
const port = 8095;
const base = `http://${host}:${port}`;
const root = resolve(process.cwd());

const portUsed = () => new Promise((done) => {
  const s = createConnection({ host, port });
  s.once("connect", () => { s.destroy(); done(true); });
  s.once("error", () => done(false));
});
async function get(path) { return freshGet(path); }
function assertPrivacyHeaders(response, { privateResponse = false, htmlDocument = false } = {}) {
  if (htmlDocument) {
    assert.match(response.headers["content-security-policy"] ?? "", /default-src 'self'/, "CSP default source");
    assert.match(response.headers["content-security-policy"] ?? "", /frame-ancestors 'none'/, "CSP frame guard");
    assert.match(response.headers["content-security-policy"] ?? "", /script-src 'self'/, "CSP script guard");
    assert.doesNotMatch(response.headers["content-security-policy"] ?? "", /script-src[^;]*unsafe-inline/, "CSP rejects inline scripts without a nonce");
  }
  assert.equal(response.headers["x-content-type-options"], "nosniff", "nosniff header");
  assert.equal(response.headers["referrer-policy"], "no-referrer", "referrer policy");
  assert.equal(response.headers["permissions-policy"], "camera=(), geolocation=(), payment=(), usb=()", "permissions policy");
  if (privateResponse) {
    assert.equal(response.headers["cache-control"], "no-store", "private response must not be cached");
    assert.equal(response.headers["x-robots-tag"], "noindex, nofollow", "private response must not be indexed");
  }
}
function freshRequest({ method, path, headers = {}, body = "", chunks, timeoutMs = 15_000 }) {
  const requestHeaders = { ...headers };
  if (method === "POST" && !Object.keys(requestHeaders).some((name) => name.toLowerCase() === "origin")) {
    requestHeaders.origin = base;
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.destroy();
      reject(error);
    };
    const succeed = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const request = httpRequest({ host, port, method, path, agent: false, headers: requestHeaders }, (response) => {
      const responseChunks = [];
      response.on("data", (part) => { responseChunks.push(Buffer.from(part)); });
      response.once("error", fail);
      response.once("aborted", () => fail(new Error(`fresh ${method} response aborted`)));
      response.once("end", () => {
        const bytes = Buffer.concat(responseChunks);
        const text = bytes.toString("utf8");
        succeed({ status: response.statusCode, headers: response.headers, text, body: text, bytes });
      });
    });
    timer = setTimeout(() => fail(new Error(`fresh ${method} timeout`)), timeoutMs);
    request.once("error", fail);
    if (chunks) {
      assert.equal(request.getHeader("content-length"), undefined, "chunked request must not set content-length");
      for (const chunk of chunks) request.write(chunk);
    }
    else if (body) request.write(body);
    request.end();
  });
}
function freshGet(path) { return freshRequest({ method: "GET", path }); }
function start(entry, dataDir, cwd = root) {
  const child = spawn(process.execPath, [entry], {
    cwd, windowsHide: true, env: { ...process.env, HOST: host, PORT: String(port),
      SILVIA_DATA_DIR: dataDir, DATABASE_URL: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "",
      SILVIA_LIVE_DEMO_ENABLED: "0", SILVIA_ENABLE_GROK_EXTENSIONS: "0", NODE_PATH: "" }, stdio: ["ignore", "pipe", "pipe"]
  });
  const logs = []; child.stdout.on("data", (x) => logs.push(String(x))); child.stderr.on("data", (x) => logs.push(String(x)));
  return { child, logs };
}
async function ready(s) {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    if (s.child.exitCode !== null) throw new Error(`server exited: ${s.child.exitCode}\n${s.logs.join("")}`);
    if (s.logs.some((x) => x.includes(`Listening on: http://${host}:${port}/`))) {
      try { if ((await get("/login")).status === 200) return; } catch { /* Dienst noch nicht bereit. */ }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not become ready on ${base}\n${s.logs.join("")}`);
}
async function stop(s) {
  if (!s || s.child.exitCode !== null || s.child.signalCode !== null) return;
  s.child.kill(); await Promise.race([once(s.child, "exit"), new Promise((r) => setTimeout(r, 2000))]);
  if (s.child.exitCode === null && s.child.signalCode === null) {
    s.child.kill("SIGKILL");
    await Promise.race([once(s.child, "exit"), new Promise((r) => setTimeout(r, 2000))]);
  }
  assert.ok(s.child.exitCode !== null || s.child.signalCode !== null,
    "Testserver läuft noch; Datenbank und Installationsordner bleiben unangetastet.");
}
async function browserChecks(paths) {
  const browser = await chromium.launch({ headless: true }); const context = await browser.newContext(); const errors = [];
  const assetCounts = { local: 0, js: 0, css: 0 };
  await context.route("**/*", (route) => new URL(route.request().url()).origin === new URL(base).origin && route.request().method() === "GET" ? route.continue() : route.abort());
  try {
    const page = await context.newPage(); page.on("pageerror", (e) => errors.push(e.message));
    for (const path of paths) {
      const response = await page.goto(`${base}${path}`, { waitUntil: "networkidle" }); assert.equal(response?.status(), 200);
      const assets = await page.locator("script[src],link[rel='stylesheet'][href]").evaluateAll((nodes) => nodes.map((n) => n.src || n.href));
      for (const url of assets) {
        assert.equal(new URL(url).origin, new URL(base).origin, `external static asset: ${url}`);
        const assetUrl = new URL(url);
        const a = await freshGet(`${assetUrl.pathname}${assetUrl.search}`);
        assert.ok(a.status >= 200 && a.status < 300, `asset ${a.status}: ${url}`);
        assetCounts.local += 1;
        if (new URL(url).pathname.endsWith(".js")) assetCounts.js += 1;
        if (new URL(url).pathname.endsWith(".css")) assetCounts.css += 1;
      }
    }
    assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
    assert.ok(assetCounts.local > 0 && assetCounts.js > 0 && assetCounts.css > 0, `static asset coverage insufficient: ${JSON.stringify(assetCounts)}`);
    return { browserFatalErrors: errors, assetCounts };
  } finally { await context.close().catch(() => {}); await browser.close().catch(() => {}); }
}
async function migrations(dataDir) {
  const { PGlite } = await import("@electric-sql/pglite"); const db = new PGlite(dataDir);
  try { const q = await db.query("select name, applied_at from _migrations order by name"); assert.ok(q.rows.length, "migration table is empty"); return q.rows.map((r) => ({ name: r.name, applied_at: String(r.applied_at) })); }
  finally { await db.close(); }
}
function speechMetadata(entry) {
  const source = readFileSync(entry, "utf8");
  const out = {};
  for (const name of ["askAlma", "speakAlma", "transcribeAlma"]) {
    const matches = [...source.matchAll(new RegExp(`createServerRpc\\(\\{\\s*id:\\s*"([^"]+)"\\s*,\\s*name:\\s*"${name}"\\s*,\\s*filename:\\s*"([^"]+)"`, "g"))];
    assert.equal(matches.length, 1, `expected one packaged metadata record for ${name}`);
    const filename = name === "askAlma" ? "ask-alma" : name === "speakAlma" ? "speak" : "transcribe";
    assert.equal(matches[0][2], `src/lib/alma/${filename}.ts`, `unexpected packaged filename for ${name}`);
    out[name] = { id: matches[0][1], filename: matches[0][2] };
  }
  const baseMatch = source.match(/SERVER_FN_BASE\s*=\s*"([^"]+)"/);
  assert.ok(baseMatch, "missing packaged SERVER_FN_BASE");
  assert.equal(new Set(Object.values(out).map((value) => value.id)).size, 3, "server function IDs are not unique");
  return { base: baseMatch[1], functions: out };
}
async function speechBodyAudit(entry) {
  const meta = speechMetadata(entry);
  const limits = { askAlma: 64 * 1024, speakAlma: 16 * 1024, transcribeAlma: 5 * 1024 * 1024 };
  const results = {};
  for (const [name, limit] of Object.entries(limits)) {
    if (name === "transcribeAlma") continue;
    const body = JSON.stringify({ data: { text: "x".repeat(limit + 1024) } });
    const suffix = name === "askAlma" ? "/extra?x=1" : "";
    const path = `${meta.base}${meta.functions[name].id}${suffix}`;
    const contentLength = Buffer.byteLength(body);
    console.error(`[speech-body-audit] phase=before-oversize function=${name} path=${path} content-length=${contentLength}`);
    const response = await freshRequest({ method: "POST", path, headers: { "content-type": "application/json", "content-length": String(contentLength), "x-tsr-serverfn": "true" }, body });
    console.error(`[speech-body-audit] phase=after-oversize function=${name} status=${response.status}`);
    assert.equal(response.status, 413, `${name} oversized body`);
    results[name] = response.status;
  }
  const transcribeBody = JSON.stringify({ data: { audio: "x".repeat(limits.transcribeAlma + 1024) } });
  const transcribePath = `${meta.base}${meta.functions.transcribeAlma.id}`;
  const chunks = Array.from({ length: 9 }, (_, index) => transcribeBody.slice(index * Math.ceil(transcribeBody.length / 9), (index + 1) * Math.ceil(transcribeBody.length / 9))).filter(Boolean);
  assert.equal(chunks.length, 9, "transcribeAlma oversized body must use 9 chunks");
  console.error(`[speech-body-audit] phase=before-chunked function=transcribeAlma path=${transcribePath} bytes=${Buffer.byteLength(transcribeBody)} chunks=${chunks.length}`);
  const started = Date.now();
  const transcribe = await freshRequest({ method: "POST", path: transcribePath, headers: { "content-type": "application/json", "x-tsr-serverfn": "true" }, chunks });
  transcribe.elapsedMs = Date.now() - started;
  console.error(`[speech-body-audit] phase=after-chunked function=transcribeAlma status=${transcribe.status} elapsedMs=${transcribe.elapsedMs}`);
  assert.equal(transcribe.status, 413, "transcribeAlma chunked oversized body");
  assert.equal(transcribe.text, "Request body too large", "transcribeAlma chunked response");
  results.transcribeAlma = transcribe.status;
  const smallBody = await toJSONAsync({ data: { audio: "", mime: "audio/webm", demo: true }, context: {} }, { plugins: defaultSerovalPlugins });
  const smallPath = `${meta.base}${meta.functions.transcribeAlma.id}?x=1`;
  console.error(`[speech-body-audit] phase=before-small function=transcribeAlma path=${smallPath}`);
  const smallRequestBody = JSON.stringify(smallBody);
  const smallHeaders = { "content-type": "application/json", "content-length": String(Buffer.byteLength(smallRequestBody)), "x-tsr-serverfn": "true" };
  const foreign = await freshRequest({
    method: "POST", path: smallPath,
    headers: { ...smallHeaders, origin: "https://evil.example" },
    body: smallRequestBody,
  });
  assert.equal(foreign.status, 403, "fremde Origin darf keine Server-Funktion schreiben");
  const small = await freshRequest({ method: "POST", path: smallPath, headers: smallHeaders, body: smallRequestBody });
  console.error(`[speech-body-audit] phase=after-small-node-http outcome=${small.status}`);
  assert.equal(small.status, 200, "small transcribeAlma envelope status");
  const smallResult = small.headers["x-tss-serialized"] === "true"
    ? fromCrossJSON(JSON.parse(small.text), { plugins: defaultSerovalPlugins })
    : JSON.parse(small.text);
  const transcribeResult = smallResult?.result ?? smallResult;
  assert.equal(transcribeResult?.ok, false, "small transcribeAlma envelope must return ok:false");
  assert.equal(transcribeResult?.reason, "quiet", "small transcribeAlma must remain provider-free");
  return { metadata: meta.functions, base: meta.base, oversized: results, foreignOriginStatus: foreign.status, smallTranscribeStatus: small.status, smallTranscribeReason: transcribeResult.reason };
}
async function browserMutationApiAudit() {
  const results = {};
  for (const path of ["/api/tafel-holen", "/api/pms-sync"]) {
    const foreign = await freshRequest({
      method: "POST",
      path,
      headers: { origin: "https://evil.example" },
    });
    assert.equal(foreign.status, 403, `fremde Origin darf ${path} nicht auslösen`);
    results[path] = foreign.status;
  }
  return results;
}
async function filmAudioAudit() {
  const results = {};
  for (const name of ["ring", "ara"]) {
    const path = `/film-audio/${name}`;
    const full = await freshRequest({ method: "GET", path });
    assert.equal(full.status, 200, `${path} GET`);
    assert.equal(full.headers["content-type"], "audio/mpeg", `${path} content type`);
    assert.ok(Number(full.headers["content-length"]) > 0, `${path} must be non-empty`);
    const head = await freshRequest({ method: "HEAD", path });
    assert.equal(head.status, 200, `${path} HEAD`);
    assert.equal(head.body, "", `${path} HEAD body`);
    assert.equal(Number(head.headers["content-length"]), Number(full.headers["content-length"]), `${path} HEAD length`);
    const end = Math.min(31, Number(full.headers["content-length"]) - 1);
    const ranged = await freshRequest({ method: "GET", path, headers: { range: `bytes=0-${end}` } });
    assert.equal(ranged.status, 206, `${path} range GET`);
    assert.equal(ranged.headers["content-range"], `bytes 0-${end}/${full.bytes.length}`, `${path} range Content-Range`);
    assert.deepEqual(ranged.bytes, full.bytes.subarray(0, end + 1), `${path} range bytes`);
    const rangedHead = await freshRequest({ method: "HEAD", path, headers: { range: `bytes=0-${end}` } });
    assert.equal(rangedHead.status, 206, `${path} range HEAD`);
    assert.equal(rangedHead.headers["content-range"], `bytes 0-${end}/${full.bytes.length}`, `${path} range HEAD Content-Range`);
    assert.equal(rangedHead.headers["content-length"], String(end + 1), `${path} range HEAD length`);
    assert.equal(rangedHead.body, "", `${path} range HEAD body`);
    const suffixLength = Math.min(17, full.bytes.length);
    const suffix = await freshRequest({ method: "GET", path, headers: { range: `bytes=-${suffixLength}` } });
    assert.equal(suffix.status, 206, `${path} suffix range GET`);
    assert.equal(suffix.headers["content-range"], `bytes ${full.bytes.length - suffixLength}-${full.bytes.length - 1}/${full.bytes.length}`, `${path} suffix Content-Range`);
    assert.deepEqual(suffix.bytes, full.bytes.subarray(full.bytes.length - suffixLength), `${path} suffix range bytes`);
    const invalidRange = await freshRequest({ method: "GET", path, headers: { range: "bytes=999999999-" } });
    assert.equal(invalidRange.status, 416, `${path} invalid range`);
    assert.equal(invalidRange.headers["accept-ranges"], "bytes", `${path} invalid range Accept-Ranges`);
    assert.equal(invalidRange.headers["content-range"], `bytes */${full.bytes.length}`, `${path} invalid range Content-Range`);
    const post = await freshRequest({ method: "POST", path });
    assert.equal(post.status, 405, `${path} POST`);
    results[name] = { get: full.status, head: head.status, range: ranged.status, rangeHead: rangedHead.status, suffixRange: suffix.status, invalidRange: invalidRange.status, post: post.status, bytes: full.bytes.length };
  }
  for (const path of ["/film-audio/unknown", "/film-audio/..%2F.env", "/film-audio/%2e%2e%2f.env"]) {
    const response = await freshRequest({ method: "GET", path });
    assert.equal(response.status, 404, `bounded path ${path}`);
  }
  return results;
}
async function standalone() {
  assert.equal(await portUsed(), false, `${base} already in use; refusing existing process`);
  const source = join(root, ".output", "server", "index.mjs"); assert.ok(existsSync(source), `missing build: ${source}`);
  const tempRoot = await mkdtemp(join(tmpdir(), "silvia-standalone-")); const dataDir = join(tempRoot, "data");
  let one; let two;
  try {
    await cp(join(root, ".output"), join(tempRoot, ".output"), { recursive: true, dereference: true });
    const entry = join(tempRoot, ".output", "server", "index.mjs"); one = start(entry, dataDir, tempRoot); await ready(one);
    const speech = process.env.SPEECH_BODY_AUDIT === "1" ? await speechBodyAudit(entry) : undefined;
    const browserMutationApi = await browserMutationApiAudit();
    const filmAudio = process.env.FILM_AUDIO_AUDIT === "1" ? await filmAudioAudit() : undefined;
    const routes = {}; for (const p of ["/login", "/sprechen", "/preise", "/api/live-demo/status"]) routes[p] = await get(p);
    for (const p of ["/login", "/sprechen", "/preise"]) assert.equal(routes[p].status, 200, p);
    assert.equal(routes["/api/live-demo/status"].status, 200); assert.equal(JSON.parse(routes["/api/live-demo/status"].body).enabled, false);
    assertPrivacyHeaders(routes["/preise"], { htmlDocument: true });
    assert.match(routes["/preise"].headers["content-security-policy"] ?? "", /script-src 'self' 'nonce-[A-Za-z0-9+/]+={0,2}'/, "SSR response has a per-response script nonce");
    assertPrivacyHeaders(routes["/login"], { privateResponse: true, htmlDocument: true });
    assertPrivacyHeaders(routes["/sprechen"], { privateResponse: true, htmlDocument: true });
    assertPrivacyHeaders(routes["/api/live-demo/status"], { privateResponse: true });
    const browser = await browserChecks(["/login", "/sprechen", "/preise"]); await stop(one); one = undefined;
    const before = await migrations(dataDir); two = start(entry, dataDir, tempRoot); await ready(two);
    const restart = {}; for (const p of ["/login", "/sprechen", "/preise"]) restart[p] = (await get(p)).status;
    assert.deepEqual(Object.values(restart), [200, 200, 200]); await stop(two); two = undefined; assert.deepEqual(await migrations(dataDir), before);
    console.log(JSON.stringify({ mode: "standalone", copied: ".output only", routes: Object.fromEntries(Object.entries(routes).map(([p, r]) => [p, r.status])), restart, migrations: before, browserMutationApi, ...(speech ? { speechBodyAudit: speech } : {}), ...(filmAudio ? { filmAudioAudit: filmAudio } : {}), ...browser }, null, 2));
  } finally {
    if (one?.logs?.length) console.error(`[speech-body-audit] phase=server-log-before-cleanup\n${one.logs.join("")}`);
    if (two?.logs?.length) console.error(`[speech-body-audit] phase=server-log-before-cleanup\n${two.logs.join("")}`);
    await stop(one); await stop(two);
    const safe = resolve(tempRoot); const tempBase = resolve(tmpdir()); const rel = relative(tempBase, safe);
    assert.ok(rel && rel !== "." && !rel.startsWith(".."), "unsafe cleanup target");
    await rm(safe, { recursive: true, force: true });
  }
}
async function defaultSmoke() {
  assert.equal(await portUsed(), false, `${base} already in use; refusing existing process`);
  const entry = join(root, ".output", "server", "index.mjs"); assert.ok(existsSync(entry), `missing build: ${entry}`);
  const s = start(entry, "memory");
  try { await ready(s); const routes = {}; for (const p of ["/login", "/sprechen", "/api/live-demo/status"]) routes[p] = await get(p); assert.equal(routes["/login"].status, 200); assert.equal(routes["/sprechen"].status, 200); assert.equal(routes["/api/live-demo/status"].status, 200); assert.equal(JSON.parse(routes["/api/live-demo/status"].body).enabled, false); assertPrivacyHeaders(routes["/login"], { privateResponse: true, htmlDocument: true }); assertPrivacyHeaders(routes["/sprechen"], { privateResponse: true, htmlDocument: true }); assertPrivacyHeaders(routes["/api/live-demo/status"], { privateResponse: true }); console.log(JSON.stringify({ routes: Object.fromEntries(Object.entries(routes).map(([p, r]) => [p, r.status])), ...(await browserChecks(["/login", "/sprechen"])) }, null, 2)); }
  finally { await stop(s); }
}
await (process.env.SPEECH_BODY_AUDIT === "1" || process.env.FILM_AUDIO_AUDIT === "1" || process.env.SILVIA_STANDALONE_AUDIT === "1" ? standalone() : defaultSmoke());
