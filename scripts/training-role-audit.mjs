#!/usr/bin/env node
/**
 * Echte Browser-/Serverprüfung für Ton & Verhalten im Training.
 * Nur synthetische Daten, eigener Vite-Prozess auf Port 8095.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { deepStrictEqual } from "node:assert";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { chromium } from "playwright";
import { defaultSerovalPlugins } from "@tanstack/router-core";
import { fromCrossJSON } from "seroval";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 8095;
const baseUrl = `http://127.0.0.1:${port}`;
const password = "Training-Role-2026!";
const ids = { practice: "training-role-practice", owner: "training-role-owner", staff: "training-role-staff" };
const behavior = "Synthetischer Inhaberinnenwert: freundlich, knapp und niemals Kosten zusagen.";
const attemptedBehavior = "UNERLAUBTER KASSA-WERT";
let tempDir;
let dataDir;
let server;
let browser;
let log = [];
let serverStopped = false;

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const passwordHash = (value) => {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(value, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt}$${key.toString("hex")}`;
};
const portFree = (candidate) => new Promise((resolve) => {
  const probe = createServer();
  probe.once("error", () => resolve(false));
  probe.once("listening", () => probe.close(() => resolve(true)));
  probe.listen(candidate, "127.0.0.1");
});

async function seed() {
  const db = new PGlite({ dataDir });
  await db.waitReady;
  try {
    await db.exec("create table _migrations (name text primary key, applied_at timestamptz not null default now())");
    const migrations = (await readdir(join(root, "migrations")))
      .filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
    for (const name of migrations) {
      await db.exec(await readFile(join(root, "migrations", name), "utf8"));
      await db.query("insert into _migrations (name) values ($1)", [name]);
    }
    await db.query("insert into practices (id, name, owner_name, email, behavior, slug) values ($1, $2, $3, $4, '', $5)", [ids.practice, "Synthetische Praxis Rollenprüfung", "Audit Inhaberin", "audit-training@example.test", ids.practice]);
    await db.query("insert into practice_users (id, practice_id, email, password_hash, name, role) values ($1, $2, $3, $4, $5, 'inhaberin')", [ids.owner, ids.practice, "audit-owner@example.test", passwordHash(password), "Audit Inhaberin"]);
    await db.query("insert into practice_users (id, practice_id, email, password_hash, name, role) values ($1, $2, $3, $4, $5, 'kassa')", [ids.staff, ids.practice, "audit-kassa@example.test", passwordHash(password), "Audit Kassa"]);
  } finally { await db.close(); }
}

async function practiceSnapshot() {
  const db = new PGlite({ dataDir });
  await db.waitReady;
  try { return (await db.query("select * from practices where id = $1", [ids.practice])).rows[0]; }
  finally { await db.close(); }
}

async function waitReady() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite beendet (${server.exitCode}).`);
    try {
      if ((await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(5_000) })).ok) return;
    } catch { /* Login-Endpunkt ist während des Hochlaufs noch nicht erreichbar. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite-Server auf Port 8095 wurde nicht bereit.");
}

async function login(page, email) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  // Die Login-Route wird im dev server lazy kompiliert; erst danach ist der
  // React-Submit-Handler sicher aktiv.
  await page.waitForTimeout(8_000);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#desk-login-submit").click();
  try { await page.waitForURL(/\/app/, { timeout: 15_000 }); }
  catch (error) {
    const body = await page.locator("body").innerText().catch(() => "");
    throw new Error(`Login ${email} fehlgeschlagen: ${error instanceof Error ? error.message : error}; Seite=${body.slice(0, 600)}`);
  }
}

async function stopServer() {
  if (!server || server.exitCode !== null) { serverStopped = true; return; }
  server.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => server.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  assert(server.exitCode !== null || server.signalCode !== null, "Testserver läuft noch; DB-Prüfung/cleanup nicht erlaubt.");
  serverStopped = true;
}

async function allTablesSnapshot() {
  const db = new PGlite({ dataDir }); await db.waitReady;
  try {
    const names = ["practices", "patients", "appointments", "calls", "threads", "mails", "emergencies", "practice_facts", "hoer_corrections", "hoer_legacy_imports"];
    const out = {};
    for (const name of names) out[name] = (await db.query(`select * from ${name} order by 1`)).rows;
    return out;
  } finally { await db.close(); }
}

function descriptor(request) {
  try { return Buffer.from((new URL(request.url()).pathname.split("/").pop() || ""), "base64url").toString("utf8"); }
  catch { return ""; }
}

async function runTestCallAudit() {
  await seed();
  const baseline = await allTablesSnapshot();
  const launch = () => {
    server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: root, env: { ...process.env, VITE_AUTH_ENABLED: "false", SILVIA_DATA_DIR: dataDir, DATABASE_URL: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", SILVIA_LLM_BASE_URL: "", SILVIA_LIVE_DEMO_ENABLED: "0" }, stdio: "pipe", windowsHide: true });
    server.stdout.on("data", (chunk) => log.push(String(chunk))); server.stderr.on("data", (chunk) => log.push(String(chunk))); return waitReady();
  };
  const callPhase = async (testMode) => {
    serverStopped = false; await launch(); browser = await chromium.launch({ headless: true }); const context = await browser.newContext();
    let askHits = 0; let audioHits = 0; const persistResults = [];
    await context.addInitScript(() => { HTMLMediaElement.prototype.play = function () { window.__auditAudioHits = (window.__auditAudioHits || 0) + 1; return Promise.resolve(); }; });
    await context.route(/^(?!http:\/\/127\.0\.0\.1:8095\/)/, (route) => route.abort());
    await context.route("**/_serverFn/**", async (route) => {
      const d = descriptor(route.request());
      if (d.includes("askAlma")) { askHits += 1; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { text: "Lokale Audit-Antwort.", source: "local", provider: "local", action: { type: "book", owner: "Audit Halterin", pet: "Audit Hund", kind: "Kontrolle", concern: "Audit", summary: "Audit Termin", startAt: "2099-01-05T09:30:00.000Z", minutes: 20 } } }) }); }
      return route.fallback();
    });
    const page = await context.newPage(); await login(page, "audit-owner@example.test");
    if (testMode) { await page.goto(`${baseUrl}/app/training`, { waitUntil: "networkidle" }); await page.getByRole("link", { name: "Testanruf starten" }).click(); }
    else await page.goto(`${baseUrl}/sprechen`, { waitUntil: "networkidle" });
    if (testMode) assert(page.url().includes("/sprechen?test=ja"), `Testanruf-URL ist nicht /sprechen?test=ja: ${page.url()}`);
    page.on("response", async (response) => { if (descriptor(response.request()).includes("persistBoardEvent")) { try { const body = await response.json(); persistResults.push(response.headers()["x-tss-serialized"] === "true" ? fromCrossJSON(body, { plugins: defaultSerovalPlugins }) : body); } catch { /* Nicht relevante oder bereits geschlossene Antwort ignorieren. */ } } });
    await page.locator("#sprechen-anrufen").click(); await page.locator("form input").first().waitFor({ state: "visible", timeout: 10_000 });
    const input = page.locator("form input").first(); await input.fill("Bitte Termin für Audit Hund"); await page.getByRole("button", { name: "Senden" }).click();
    await page.getByText("Lokale Audit-Antwort.").waitFor({ timeout: 15_000 });
    if (testMode) await page.getByText("Testanruf – es wurde nichts auf der Praxistafel gespeichert.").waitFor({ timeout: 15_000 });
    else { const note = page.locator("#sprechen-board-note"); await note.waitFor({ state: "visible", timeout: 15_000 }); assert(/Termin liegt|Audit Hund/.test(await note.innerText()), `Normaler Kontrolllauf zeigt keinen Termin-Hinweis: ${await note.innerText()}`); assert(persistResults.some((x) => (x.result ?? x)?.ok === true), "persistBoardEvent meldete nicht ok:true."); }
    audioHits = await page.evaluate(() => window.__auditAudioHits || 0); assert(askHits === 1, `${testMode ? "Test" : "Normal"}: askAlma-Mock wurde ${askHits}x getroffen.`); assert(audioHits > 0, `${testMode ? "Test" : "Normal"}: keine lokale Audio-Wiedergabe (Provider-Audio ist nicht beteiligt).`);
    await context.close(); await browser.close(); browser = null; await stopServer(); return { askHits, audioHits };
  };
  const testPhase = await callPhase(true);
  const afterTest = await allTablesSnapshot();
  try { deepStrictEqual(afterTest, baseline); } catch (error) { throw new Error(`Testmodus verändert Praxistabellen: ${error.message}`); }
  const normalPhase = await callPhase(false);
  const afterNormal = await allTablesSnapshot();
  assert(afterNormal.appointments.some((r) => r.owner_name === "Audit Halterin" && r.pet === "Audit Hund"), "Kontrolllauf erzeugte keinen gezielten Audit-Termin.");
  assert(afterNormal.calls.some((r) => r.caller === "Audit Halterin" && r.pet === "Audit Hund"), "Kontrolllauf erzeugte keinen gezielten Audit-Anruf.");
  const result = { ok: true, port, phases: { test: testPhase, normal: normalPhase }, checks: ["/app/training startet echten /sprechen?test=ja-Testanruf", "Testmodus lässt Praxistabellen unverändert", "normaler book-Kontrolllauf persistiert ok:true und schreibt gezielten Audit-Termin und Anruf", "askAlma exakt einmal je Phase", "lokale Audio-Wiedergabe unterdrückt; keine Provider-Audioantwort"], logPath: join(root, "artifacts", "training-test-call-audit.log") };
  await mkdir(join(root, "artifacts"), { recursive: true }); await writeFile(join(root, "artifacts", "training-test-call-audit.log"), `${JSON.stringify(result, null, 2)}\n`, "utf8"); console.log(JSON.stringify(result, null, 2));
}

async function main() {
  assert(await portFree(port), "Port 8095 ist belegt; kein fremder Prozess wird verwendet.");
  tempDir = await mkdtemp(join(tmpdir(), "silvia-training-role-audit-"));
  dataDir = join(tempDir, "pglite");
  if (process.env.TEST_CALL_AUDIT === "1") return runTestCallAudit();
  await seed();
  const before = await practiceSnapshot();
  assert(before?.behavior === "", "Fixture startet nicht mit leerem Verhalten.");
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: root,
    env: { ...process.env, VITE_AUTH_ENABLED: "false", SILVIA_DATA_DIR: dataDir, DATABASE_URL: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", SILVIA_LLM_BASE_URL: "", SILVIA_LIVE_DEMO_ENABLED: "0" },
    stdio: "pipe", windowsHide: true,
  });
  server.stdout.on("data", (chunk) => log.push(String(chunk)));
  server.stderr.on("data", (chunk) => log.push(String(chunk)));
  await waitReady();
  browser = await chromium.launch({ headless: true });
  const ownerContext = await browser.newContext();
  const staffContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const staffPage = await staffContext.newPage();
  const ownerPosts = [];
  ownerPage.on("request", (request) => { if (request.method() === "POST") ownerPosts.push({ url: request.url(), body: request.postData() || "", headers: request.headers() }); });
  for (const context of [ownerContext, staffContext]) await context.route(/^(?!http:\/\/127\.0\.0\.1:8095\/)/, (route) => route.abort());
  await login(ownerPage, "audit-owner@example.test");
  await ownerPage.goto(`${baseUrl}/app/training`, { waitUntil: "networkidle" });
  const textareas = ownerPage.locator("textarea");
  assert(await textareas.count() >= 2, "Training-Seite enthält nicht die erwarteten Textfelder.");
  await textareas.nth(1).fill(behavior);
  await ownerPage.getByRole("button", { name: "Ton und Verhalten speichern" }).click();
  await ownerPage.getByText("Ton und Verhalten gespeichert.").waitFor({ timeout: 10_000 });
  // Keine zweite PGlite-Verbindung während der laufenden Serverdatenbank.
  await ownerPage.reload({ waitUntil: "networkidle" });
  assert(await textareas.nth(1).inputValue() === behavior, "Reload zeigt nicht denselben Verhaltenstext.");
  await login(staffPage, "audit-kassa@example.test");
  await staffPage.goto(`${baseUrl}/app/training`, { waitUntil: "networkidle" });
  const staffText = staffPage.locator("textarea").nth(1);
  const staffSave = staffPage.getByRole("button", { name: "Ton und Verhalten speichern" });
  assert(await staffText.isDisabled(), "Kassa-Textfeld ist bearbeitbar.");
  assert(await staffSave.isDisabled(), "Kassa-Speichern ist aktiv.");
  const observed = ownerPosts.find((item) => item.body.includes(behavior));
  assert(observed, "Echter savePracticeBehavior-POST der Inhaberin wurde nicht aufgezeichnet.");
  const replayHeaders = Object.fromEntries(Object.entries(observed.headers).filter(([key]) => !["host", "content-length", "cookie", "origin", "referer", "user-agent", "connection", "accept-encoding"].includes(key) && !key.startsWith("sec-")));
  const replay = await staffPage.evaluate(async ({ url, headers, body }) => {
    const response = await fetch(url, { method: "POST", headers, body, credentials: "same-origin" });
    return { status: response.status, text: await response.text() };
  }, { url: observed.url, headers: replayHeaders, body: observed.body.replaceAll(behavior, attemptedBehavior) });
  assert(replay.status >= 200 && replay.status < 300, `Replay des echten Serverrequests war HTTP ${replay.status}.`);
  let decoded = null;
  if (replay.text) {
    try { decoded = fromCrossJSON(JSON.parse(replay.text), { plugins: defaultSerovalPlugins }); }
    catch { decoded = JSON.parse(replay.text); }
  }
  const replayResult = decoded?.result ?? decoded;
  assert(replayResult?.ok === false, `Kassa-Replay liefert nicht result.ok:false: ${replay.text.slice(0, 300)}`);
  assert(String(replayResult.error || "").includes("Inhaberin"), "Kassa-Replay nennt nicht die Rollenbeschränkung.");
  await ownerContext.close(); await staffContext.close(); await browser.close(); browser = null;
  await stopServer();
  const after = await practiceSnapshot();
  assert(after?.behavior === behavior, "Kassa-Replay hat den Inhaberinnenwert verändert.");
  try { deepStrictEqual({ ...after, behavior: before.behavior }, before); }
  catch (error) { throw new Error(`Unerwartete Änderung der practices-Zeile: ${error.message}`); }
  const result = { ok: true, port, checks: ["Inhaberin speichert Ton/Verhalten", "Reload zeigt identischen Wert", "Kassa-UI deaktiviert", "echter savePracticeBehavior-Request mit Kassa-Sitzung ok:false", "DB bleibt Inhaberinnenwert"], limitations: ["synthetische PGlite-Datenbank", "Netzwerk außerhalb 127.0.0.1:8095 blockiert", "Produktsource unverändert"] };
  const artifactDir = join(root, "artifacts");
  await mkdir(artifactDir, { recursive: true });
  const logPath = join(artifactDir, "training-role-audit.log");
  await writeFile(logPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...result, logPath }, null, 2));
}

try { await main(); }
catch (error) {
    try { if (browser) await browser.close(); } catch { /* Browser-Cleanup ist best effort. */ }
  try { await stopServer(); } catch (stopError) { log.push(String(stopError)); }
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), serverLog: log.join("").slice(-3000) }, null, 2));
  process.exitCode = 1;
}
finally {
  const tmpRoot = resolve(tmpdir());
  const ownedTemp = tempDir && isAbsolute(tempDir) && resolve(tempDir) !== tmpRoot
    && basename(resolve(tempDir)).startsWith("silvia-training-role-audit-")
    && !relative(tmpRoot, resolve(tempDir)).startsWith("..")
    && !isAbsolute(relative(tmpRoot, resolve(tempDir)));
  if (ownedTemp && serverStopped) await rm(resolve(tempDir), { recursive: true, force: true });
}
