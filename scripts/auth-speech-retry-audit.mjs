#!/usr/bin/env node
/**
 * Browser-Abnahmetest fuer die echte angemeldete Sprachschulung.
 *
 * Der Browser benutzt den echten Login, die echte SprechenCall-Komponente und
 * die echte reportHoerKorrektur-Server-Fn. Nur Audio/STT und der erste
 * Korrekturversuch werden kontrolliert simuliert.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { chromium } from "playwright";
import { defaultSerovalPlugins } from "@tanstack/router-core";
import { fromCrossJSON, toJSONAsync } from "seroval";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 8095;
const baseUrl = `http://127.0.0.1:${port}`;
const password = "Speech-Audit-2026!";
const ids = {
  aPractice: "speech-audit-practice-a", bPractice: "speech-audit-practice-b",
  aUser: "speech-audit-user-a", bUser: "speech-audit-user-b",
  aFact: "speech-audit-fact-a", bMergeTarget: "speech-audit-fact-b-target",
};
const mergeSourceText = "Audit Merge Quelle: vertrauliche Ausgangsregel.";
const mergeTargetText = "Audit Merge Ziel: bereits vorhandene Regel.";
const aSentinelText = "Nur Praxis A: unveränderter Kontrollhinweis.";
const practiceMergeAudit = process.env.PRACTICE_MERGE_AUDIT === "1";
const initialA = { ts: "2026-09-11T12:00:00.000Z", heard: "Mikrochip", corrected: "Mikro-Chip", practiceId: ids.aPractice };
let tempDir;
let server;
let keepTemp = false;
const serverLog = [];

function passwordHash(value) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(value, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt}$${key.toString("hex")}`;
}
function isPortFree(p) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(p, "127.0.0.1");
  });
}
async function seed(dataDir) {
  const db = new PGlite({ dataDir });
  await db.waitReady;
  try {
    await db.exec("create table _migrations (name text primary key, applied_at timestamptz not null default now())");
    const migrations = (await readdir(join(root, "migrations"))).filter((name) => name.endsWith(".sql")).sort();
    for (const name of migrations) {
      await db.exec(await readFile(join(root, "migrations", name), "utf8"));
      await db.query("insert into _migrations (name) values ($1)", [name]);
    }
    for (const side of ["a", "b"]) {
      const practiceId = ids[`${side}Practice`];
      const userId = ids[`${side}User`];
      await db.query("insert into practices (id, name, owner_name, email, city, slug) values ($1, $2, $3, $4, $5, $6)", [practiceId, `Speech Audit Praxis ${side.toUpperCase()}`, `Audit ${side.toUpperCase()}`, `speech-${side}@example.test`, side === "b" ? "Graz" : "Wien", `speech-audit-${side}`]);
      await db.query("insert into practice_users (id, practice_id, email, password_hash, name, role) values ($1, $2, $3, $4, $5, 'inhaberin')", [userId, practiceId, `speech-${side}@example.test`, passwordHash(password), `Audit ${side.toUpperCase()}`]);
    }
    if (practiceMergeAudit) {
      // Der Zielhinweis existiert vor dem UI-Lauf bereits. Die Quelle wird
      // ausschließlich durch die echte Wissenstraining-UI erzeugt.
      await db.query("insert into practice_facts (id, practice_id, fact) values ($1, $2, $3), ($4, $5, $6)", [
        ids.aFact, ids.aPractice, aSentinelText,
        ids.bMergeTarget, ids.bPractice, mergeTargetText,
      ]);
    }
  } finally { await db.close(); }
  await writeFile(join(dataDir, "silvia-hoer-korrekturen.jsonl"), `${JSON.stringify(initialA)}\n`, "utf8");
}
async function waitForServer(child) {
  const until = Date.now() + 45_000;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`Vite beendet (${child.exitCode}).`);
    try { if ((await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(5_000) })).ok) return; } catch { /* startet noch */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Isolierter Vite-Server auf Port ${port} wurde nicht bereit.`);
}
async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12_000);
  // Der erste Client-Import kann waehrend Vites Dependency-Optimizer neu
  // laden. Ein Reload holt danach die stabile, kompilierte Route.
  if (!(await page.locator("#desk-login-submit").count())) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5_000);
  }
  await page.locator("#email").fill("speech-b@example.test");
  await page.locator("#password").fill(password);
  const post = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 15_000 });
  await page.locator("#desk-login-submit").click();
  await post;
  await page.waitForURL(/\/app/, { timeout: 15_000 });
}
async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  const exited = await Promise.race([new Promise((resolve) => server.once("exit", () => resolve(true))), new Promise((resolve) => setTimeout(() => resolve(false), 5_000))]);
  if (!exited && server.exitCode === null) server.kill();
}
async function readDbCorrections(dataDir) {
  const db = new PGlite({ dataDir });
  await db.waitReady;
  try {
    const rows = await db.query("select practice_id as \"practiceId\", heard, corrected, created_at as ts from hoer_corrections order by practice_id, created_at, id");
    return rows.rows.map((row) => ({ ...row, ts: row.ts instanceof Date ? row.ts.toISOString() : String(row.ts) }));
  } finally {
    await db.close();
  }
}

async function readDbFacts(dataDir) {
  const db = new PGlite({ dataDir });
  await db.waitReady;
  try {
    const rows = await db.query("select id, practice_id as \"practiceId\", fact from practice_facts order by id");
    return rows.rows;
  } finally {
    await db.close();
  }
}

async function decodeServerFnResponse(response) {
  const body = await response.json();
  return response.headers()["x-tss-serialized"] === "true"
    ? fromCrossJSON(body, { plugins: defaultSerovalPlugins })
    : body;
}

async function main() {
  assert(await isPortFree(port), `Port ${port} ist belegt; fremder Prozess wird nicht veraendert.`);
  tempDir = await mkdtemp(join(tmpdir(), "silvia-auth-speech-audit-"));
  const dataDir = join(tempDir, "pglite");
  await seed(dataDir);
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port)], { cwd: root, env: { ...process.env, VITE_AUTH_ENABLED: "false", SILVIA_DATA_DIR: dataDir, DATABASE_URL: "", OPENAI_API_KEY: "", KIMI_API_KEY: "", ANTHROPIC_API_KEY: "", GEMINI_API_KEY: "", SILVIA_LLM_BASE_URL: "", SILVIA_ENABLE_GROK_EXTENSIONS: "0" }, stdio: "pipe", windowsHide: true });
  server.stdout.on("data", (chunk) => serverLog.push(String(chunk)));
  server.stderr.on("data", (chunk) => serverLog.push(String(chunk)));
  await waitForServer(server);
  // Vite kompiliert den TanStack-Client beim ersten Browseraufruf lazy.
  // Den Optimizer erst auslaufen lassen, damit der echte Login nicht mitten
  // in einem Client-Reload beobachtet wird.
  await new Promise((resolve) => setTimeout(resolve, 12_000));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  let authenticated = false;
  let firstCorrection503 = false;
  let correctionPosts = 0;
  let mockedStt = 0;
  const blockedExternal = [];
  let successfulCorrectionRequest = null;
  let firstCorrectionRequestBody = null;
  let afterCommitObserved = false;
  let practiceMergeSourceId = null;
  const auditAfterCommit = process.env.SPEECH_AUDIT_AFTER_COMMIT === "1";
  await context.addInitScript(() => {
    class FakeSpeechRecognition {
      start() { this.onstart?.(); setTimeout(() => { this.onresult?.({ results: [{ 0: { transcript: "Röntgen" }, isFinal: true }], length: 1 }); this.onend?.(); }, 20); }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    }
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeSpeechRecognition });
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: FakeSpeechRecognition });
    const track = { readyState: "live", stop() { this.readyState = "ended"; } };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [track] }) } });
    let emittedRecording = false;
    class FakeMediaRecorder {
      static isTypeSupported() { return true; }
      constructor() { this.state = "inactive"; }
      start() {
        this.state = "recording";
        this.emitsAudio = !emittedRecording;
        if (this.emitsAudio) {
          emittedRecording = true;
          setTimeout(() => this.stop(), 250);
        }
      }
      stop() {
        if (this.state !== "recording") return;
        this.state = "inactive";
        if (this.emitsAudio) {
          this.ondataavailable?.({ data: new Blob([new Uint8Array(5000)], { type: "audio/webm" }) });
        }
        this.onstop?.();
      }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
    Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined });
    Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: undefined });
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== new URL(baseUrl).origin) {
      blockedExternal.push({ method: request.method(), resourceType: request.resourceType(), url: request.url() });
      return route.abort();
    }
    if (request.method() === "POST" && authenticated && !request.url().includes("/_serverFn/")) return route.abort();
    return route.fallback();
  });
  await context.route("**/_serverFn/**", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();
    const encoded = request.url().split("/").pop() || "";
    let descriptor = "";
    try { descriptor = Buffer.from(encoded, "base64url").toString("utf8"); } catch { /* kein lesbarer Descriptor */ }
    const body = request.postData() || "";
    if (descriptor.includes('"export":"speakAlma_createServerFn_handler"')) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false }) });
    }
    if (descriptor.includes('"export":"transcribeAlma_createServerFn_handler"')) {
      mockedStt += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: { ok: true, text: "Röntgen" } }),
      });
    }
    if (practiceMergeAudit && descriptor.includes("askAlma")) {
      // Das Wissen wird erst nach dieser Antwort durch rememberPracticeFact
      // gespeichert. Die Antwort selbst ist lokal und verhindert jeden
      // Provider-Aufruf mit etwaigen Umgebungsvariablen.
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: {
          text: "Lokale Audit-Antwort.", source: "local", provider: "local",
          action: { type: "none", owner: "Klientel", pet: "Patient", kind: "Anliegen", concern: "", summary: "" },
        } }),
      });
    }
    if (descriptor.includes("reportHoerKorrektur") && body.includes("Röntgenaufnahme")) {
      correctionPosts += 1;
      if (!firstCorrectionRequestBody) firstCorrectionRequestBody = body;
      if (!firstCorrection503) {
        firstCorrection503 = true;
        if (auditAfterCommit) {
          const response = await route.fetch({ timeout: 15_000, maxRedirects: 0 });
          const responseBody = await response.json();
          const decoded = response.headers()["x-tss-serialized"] === "true"
            ? fromCrossJSON(responseBody, { plugins: defaultSerovalPlugins })
            : responseBody;
          afterCommitObserved = response.ok() && decoded?.result?.ok === true;
          if (!afterCommitObserved) throw new Error("reportHoerKorrektur meldete keinen erfolgreichen Commit");
          return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "controlled post-commit audit failure" }) });
        }
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "controlled audit failure" }) });
      }
      successfulCorrectionRequest = { url: request.url(), headers: await request.allHeaders(), body };
      return route.fallback();
    }
    // Der optionale Fakten-Merge-Audit verwendet nur diese zwei echten
    // Server-Funktionen. Alles andere bleibt nach dem Login gesperrt.
    if (practiceMergeAudit && (
      descriptor.includes("rememberPracticeFact") ||
      descriptor.includes("replacePracticeFact")
    )) return route.fallback();
    if (!authenticated) return route.fallback();
    return route.abort();
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await login(page);
    authenticated = true;
    await page.goto(`${baseUrl}/sprechen?training=sprache`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    const startTraining = page.locator("#sprechen-anrufen");
    await startTraining.waitFor();
    await startTraining.click();
    // This button is rendered only while the hydrated component is ringing/live.
    await page.locator("#sprechen-training-beenden").waitFor();
    const correction = page.locator("#hoer-korrigieren");
    // Anrufen startet die Aufnahme selbst; kein zweiter Mikrofon-Klick.
    await correction.waitFor().catch(async (error) => { throw new Error(`${error.message}; UI=${(await page.locator("body").innerText()).slice(-1600)}`); });
    assert.equal(await page.locator('[data-line-role="user"]').count(), 1, "Vor der Korrektur darf genau eine Fake-Äußerung stehen.");
    assert.equal(await page.locator('[data-line-role="user"]').last().innerText(), "Röntgen\nKorrigieren", "Original-Hoertext fehlt vor der Korrektur.");
    await page.locator("#hoer-korrigieren").click();
    const input = page.locator("form").filter({ has: page.locator("#hoer-korrigieren-note") }).locator("input");
    await input.fill("Röntgenaufnahme");
    const submit = input.locator("xpath=ancestor::form").locator("button[type=submit]");
    await submit.click();
    await page.getByText(/Fachbegriff-Korrektur nicht gespeichert/).waitFor();
    assert.equal(await input.inputValue(), "Röntgenaufnahme", "503 muss den Edittext behalten.");
    assert.equal(await page.locator('[data-line-role="user"]').last().innerText(), "Röntgen\nKorrigieren", "503 muss die Original-Blase sichtbar lassen.");
    await submit.click();
    await page.getByText("Fachbegriff korrigiert. Das hilft der nächsten Erkennung.", { exact: true }).waitFor();
    assert.equal(await input.count(), 0, "Erfolgreicher Retry muss das Korrekturformular schließen.");
    assert(firstCorrection503 && correctionPosts === 2, `Erwartet genau 503+Retry, beobachtet ${correctionPosts} Korrektur-POSTs.`);
    if (auditAfterCommit) assert(afterCommitObserved, "Der erste Audit-Request muss serverseitig erfolgreich gespeichert worden sein.");
    assert(mockedStt >= 1, "STT-Missing wurde nicht kontrolliert simuliert.");

    assert(successfulCorrectionRequest, "Erfolgreicher reportHoerKorrektur-Request wurde nicht aufgezeichnet.");
    assert.equal(new URL(successfulCorrectionRequest.url).origin, baseUrl, "Replay darf nur an den lokalen Server gehen.");
    async function serializePayload(data) {
      return JSON.stringify(await toJSONAsync({ data }, { plugins: defaultSerovalPlugins }));
    }
    const requestIdMatch = successfulCorrectionRequest.body.match(/requestId[\s\S]{0,180}?"s":"([0-9a-f-]{36})"/i);
    assert(requestIdMatch, "UI-Korrektur muss eine UUID als Request-ID senden.");
    assert.equal(
      successfulCorrectionRequest.body,
      await serializePayload({ heard: "Röntgen", corrected: "Röntgenaufnahme", requestId: requestIdMatch[1], demo: false }),
      "Replay muss den vom ServerFn-Client aufgezeichneten Serializer verwenden.",
    );
    assert.equal(successfulCorrectionRequest.body, firstCorrectionRequestBody, "Retry muss exakt dieselbe Request-Payload verwenden.");

    if (practiceMergeAudit) {
      let mergeFirst503 = false;
      let mergePosts = 0;
      let mergeAfterCommit = null;
      const mergeRoute = async (route) => {
        const request = route.request();
        if (request.method() !== "POST") return route.fallback();
        const encoded = request.url().split("/").pop() || "";
        const descriptor = Buffer.from(encoded, "base64url").toString("utf8");
        if (!descriptor.includes("replacePracticeFact") || !(request.postData() || "").includes(mergeTargetText)) return route.fallback();
        mergePosts += 1;
        if (!mergeFirst503) {
          mergeFirst503 = true;
          const response = await route.fetch({ timeout: 15_000, maxRedirects: 0 });
          const decoded = await decodeServerFnResponse(response);
          mergeAfterCommit = decoded?.result ?? null;
          assert(response.ok() && mergeAfterCommit?.ok === true && mergeAfterCommit.id, "Der erste echte Merge-POST muss vor dem 503 erfolgreich sein und die Quell-ID liefern.");
          return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "controlled post-commit merge audit failure" }) });
        }
        return route.fallback();
      };
      await context.route("**/_serverFn/**", mergeRoute);
      try {
        await page.goto(`${baseUrl}/sprechen?training=wissen`, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle");
        const trainingStart = page.locator("#sprechen-anrufen");
        await trainingStart.waitFor();
        await trainingStart.click();
        // Dieser Zustand wird erst nach React-Hydration im echten Training
        // gerendert; kein Warten auf das Verschwinden eines Startknopfs.
        await page.locator("#sprechen-training-beenden").waitFor();
        // Das echte Wissenstraining startet die Mikrofonaufnahme sofort.
        // Wir beenden sie über den sichtbar gerenderten UI-Schalter, damit
        // der anschließende, absichtlich getippte Audit-Hinweis editierbar ist.
        const finishListening = page.getByRole("button", { name: "Fertig", exact: true });
        await finishListening.waitFor();
        await finishListening.click();
        const trainingInput = page.locator("form").locator("input");
        await trainingInput.fill(mergeSourceText);
        const send = trainingInput.locator("xpath=ancestor::form").locator("button[type=submit]");
        const sourceRememberResponse = page.waitForResponse((response) => {
          if (response.request().method() !== "POST") return false;
          const encoded = response.url().split("/").pop() || "";
          return Buffer.from(encoded, "base64url").toString("utf8").includes("rememberPracticeFact");
        }, { timeout: 15_000 });
        await send.click();
        const sourceRemember = (await decodeServerFnResponse(await sourceRememberResponse))?.result;
        assert(sourceRemember?.ok === true && sourceRemember.id, "Der durch die echte UI angelegte Quellhinweis lieferte keine erfolgreiche Quellen-ID.");
        await page.getByText("Hinweis gespeichert.", { exact: true }).waitFor();
        const correct = page.locator("#hoer-korrigieren");
        await correct.waitFor();
        assert.equal(await page.locator('[data-line-role="user"]').last().innerText(), `${mergeSourceText}\nKorrigieren`, "Der UI-Quellhinweis fehlt vor dem Merge.");
        await correct.click();
        const correctionInput = page.locator("form").filter({ has: page.locator("#hoer-korrigieren-note") }).locator("input");
        await correctionInput.fill(mergeTargetText);
        const correctSubmit = correctionInput.locator("xpath=ancestor::form").locator("button[type=submit]");
        await correctSubmit.click();
        await page.getByText("Korrektur nicht gespeichert.", { exact: true }).waitFor();
        assert.equal(await correctionInput.inputValue(), mergeTargetText, "Das 503 nach Commit muss den Korrekturtext im UI belassen.");
        assert.equal(await page.locator('[data-line-role="user"]').last().innerText(), `${mergeSourceText}\nKorrigieren`, "Das 503 nach Commit muss die ursprüngliche UI-Zeile belassen.");
        await correctSubmit.click();
        await page.getByText("Hinweis korrigiert.", { exact: true }).waitFor();
        assert.equal(await correctionInput.count(), 0, "Der erfolgreiche Merge-Retry muss das Korrekturformular schließen.");
        assert(mergeFirst503 && mergePosts === 2, `Erwartet genau einen post-commit 503 und einen UI-Retry, beobachtet ${mergePosts} Replace-POSTs.`);
        assert(mergeAfterCommit?.id === sourceRemember.id, "Der vor dem 503 bestätigte Merge muss dieselbe Quellen-ID wie die echte UI-Anlage zurückgeben.");
        practiceMergeSourceId = sourceRemember.id;
        console.log(JSON.stringify({ practiceMergeRetry: { sourceId: mergeAfterCommit.id, targetId: ids.bMergeTarget, posts: mergePosts, afterCommit: true } }));
      } finally {
        await context.unroute("**/_serverFn/**", mergeRoute);
      }
    }
    const replayHeaders = { ...successfulCorrectionRequest.headers };
    delete replayHeaders.cookie;
    delete replayHeaders["content-length"];
    delete replayHeaders.host;
    const bCookies = await context.cookies(baseUrl);
    const bCookieHeader = bCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    assert(bCookieHeader, "Authentifizierte B-Session fehlt fuer den Replay.");
    async function requestReplay(data, cookieHeader = "") {
      const headers = { ...replayHeaders };
      if (cookieHeader) headers.cookie = cookieHeader;
      const response = await fetch(successfulCorrectionRequest.url, {
        method: "POST",
        headers,
        body: await serializePayload(data),
        signal: AbortSignal.timeout(15_000),
        redirect: "manual",
      });
      assert.equal(new URL(response.url).origin, baseUrl, "Replay-Antwort darf keine fremde Origin haben.");
      assert.equal(response.headers.get("location"), null, "Replay darf nicht umgeleitet werden.");
      const body = await response.json();
      return {
        status: response.status,
        body: response.headers.get("x-tss-serialized") === "true"
          ? fromCrossJSON(body, { plugins: defaultSerovalPlugins })
          : body,
      };
    }
    const synthetic = { heard: "B-Synthetisch", corrected: "B-Synthetisch-korrigiert", practiceId: ids.aPractice, userId: ids.aUser, demo: false };
    const bReplay = await requestReplay(synthetic, bCookieHeader);
    assert.equal(bReplay.body.result?.ok, true, `Authentifizierter B-Replay abgelehnt (HTTP ${bReplay.status}).`);
    const anonymousReplay = await requestReplay(synthetic);
    assert.equal(anonymousReplay.body.result?.ok, false, "Cookie-freier Replay darf keine Korrektur speichern.");
    const demoReplay = await requestReplay({ ...synthetic, demo: true }, bCookieHeader);
    assert.equal(demoReplay.body.result?.ok, false, "Demo-Replay mit B-Cookie darf keine Korrektur speichern.");
    console.log("[auth-speech] lokale HTTP-Mutationsreplays und Cookie-/Demo-Ablehnungen erfolgreich");
    console.log("[auth-speech] echte UI-Korrektur und Retry erfolgreich");
  } finally { await context.close(); await browser.close(); await stopServer(); }
  assert.deepEqual(blockedExternal, [], `Unerwartete externe Anfragen wurden blockiert: ${JSON.stringify(blockedExternal)}.`);
  const corrections = await readDbCorrections(dataDir);
  assert.equal(corrections.length, 3, "Es duerfen genau Initial-A plus UI-B plus Mutation-B vorhanden sein.");
  const aEntries = corrections.filter((entry) => entry.practiceId === ids.aPractice);
  const bEntries = corrections.filter((entry) => entry.practiceId === ids.bPractice);
  assert.deepEqual(aEntries, [initialA], "Praxis A wurde durch Praxis B veraendert.");
  assert.deepEqual(bEntries.map(({ practiceId, heard, corrected }) => ({ practiceId, heard, corrected })), [
    { practiceId: ids.bPractice, heard: "Röntgen", corrected: "Röntgenaufnahme" },
    { practiceId: ids.bPractice, heard: "B-Synthetisch", corrected: "B-Synthetisch-korrigiert" },
  ], "Praxis B muss genau die UI- und die authentifizierte Mutation enthalten.");
  if (process.env.PRACTICE_MERGE_AUDIT === "1") {
    const facts = await readDbFacts(dataDir);
    const aSentinel = facts.find((fact) => fact.id === ids.aFact);
    const mergeSource = facts.find((fact) => fact.fact === mergeTargetText && fact.practiceId === ids.bPractice);
    assert.deepEqual(aSentinel, { id: ids.aFact, practiceId: ids.aPractice, fact: aSentinelText }, "Praxis-A-Sentinel wurde durch den UI-Merge verändert.");
    assert(mergeSource?.id === practiceMergeSourceId, "Der finale UI-Retry muss die Quell-ID mit Zieltext erhalten.");
    assert(!facts.some((fact) => fact.id === ids.bMergeTarget), "Der doppelte B-Zielhinweis muss beim Merge entfernt werden.");
    assert.equal(facts.filter((fact) => fact.practiceId === ids.bPractice && fact.fact === mergeTargetText).length, 1, "Nach dem Merge darf nur ein B-Zielhinweis verbleiben.");
  }
  console.log(JSON.stringify({ ok: true, port, checks: ["authentifizierte Praxis-B-UI", "erster echter reportHoerKorrektur-POST 503", "Retry persistiert Server-Hoerlog", "B-Mutation ignoriert fremde practiceId/userId", "Cookie-freier Request abgelehnt", "demo:true abgelehnt", "B exakt erwartete Zeilen", "A unveraendert", "externe Anfragen blockiert"] }, null, 2));
}
main().catch((error) => { keepTemp = true; console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), tempDir, serverLog: serverLog.join("").slice(-3000) }, null, 2)); process.exitCode = 1; }).finally(async () => { await stopServer(); if (tempDir && !keepTemp) await rm(tempDir, { recursive: true, force: true }); if (keepTemp && tempDir) console.error(`Temporäre Fehlerdaten bleiben zur Prüfung erhalten: ${tempDir}`); });
