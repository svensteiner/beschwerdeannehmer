#!/usr/bin/env node
/** Echter Browserlauf gegen den bereits erzeugten isolierten Nitro-Build. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const tempRoot = "C:\\Users\\svens\\AppData\\Local\\Temp\\silvia-home-audit-6CU1VF";
const host = "127.0.0.1";
const port = 8094;
const base = `http://${host}:${port}`;
const entry = `${tempRoot}\\.output\\server\\index.mjs`;
const screenshot = "C:\\silvia\\artifacts\\home-conversation-production-20260912.png";

function freePort() {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}
function env() {
  const names = ["PATH", "SystemRoot", "ComSpec", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "ProgramData"];
  const safe = Object.fromEntries(names.filter((n) => typeof process.env[n] === "string").map((n) => [n, process.env[n]]));
  safe.PATH = `${tempRoot}\\node_modules\\.bin${process.platform === "win32" ? ";" : ":"}${safe.PATH ?? ""}`;
  Object.assign(safe, {
    HOST: host, PORT: String(port), VITE_AUTH_ENABLED: "false", SILVIA_DATA_DIR: "memory",
    DATABASE_URL: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", KIMI_API_KEY: "", GEMINI_API_KEY: "",
    SILVIA_LLM_BASE_URL: "", SILVIA_LIVE_DEMO_ENABLED: "0", SILVIA_BOOKING: "",
    NODE_USE_ENV_PROXY: "0", HTTP_PROXY: "", HTTPS_PROXY: "", ALL_PROXY: "",
  });
  return safe;
}
async function waitReady(child, logs) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Server beendet: ${child.exitCode ?? child.signalCode}`);
    try {
      const status = await new Promise((resolve, reject) => {
        const request = httpRequest({ host, port, path: "/", method: "GET", agent: false }, (response) => {
          response.resume();
          response.once("end", () => resolve(response.statusCode));
        });
        request.setTimeout(1500, () => { request.destroy(); reject(new Error("timeout")); });
        request.once("error", reject);
        request.end();
      });
      if (status === 200) return;
    } catch { /* startet noch */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Server nicht bereit: ${logs.join("").slice(-1200)}`);
}
async function stop(child) {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  if (child.exitCode === null && child.signalCode === null) {
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 5000))]);
  }
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  if (child.exitCode === null && child.signalCode === null) {
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 5000))]);
  }
  assert(child.exitCode !== null || child.signalCode !== null, "Auditserver läuft nach Cleanup weiter");
}

assert(await freePort(), `Port ${port} ist belegt`);
await mkdir("C:\\silvia\\artifacts", { recursive: true });
const logs = [];
const server = spawn(process.execPath, [entry], { cwd: tempRoot, env: env(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
server.stdout.on("data", (chunk) => logs.push(String(chunk)));
server.stderr.on("data", (chunk) => logs.push(String(chunk)));
let browser;
try {
  await waitReady(server, logs);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  let blockedExternal = 0;
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base) {
      blockedExternal += 1;
      return route.abort();
    }
    if (request.method() === "POST" && !url.pathname.startsWith("/_serverFn/")) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(`${base}/#anrufen`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.locator("#anrufen").waitFor();
  await page.screenshot({ path: screenshot, fullPage: false });
  const start = page.locator("#anrufen #sprechen-anrufen");
  assert.equal(await start.count(), 1, "Homepage-Anrufstart fehlt");
  await start.click();
  const input = page.locator("#anrufen input").first();
  await input.waitFor({ timeout: 10_000 });
  const audioUi = await input.getAttribute("placeholder");
  await input.fill("Wie sind die Öffnungszeiten?");
  const assistantBefore = await page.locator('#anrufen [data-line-role="assistant"]').count();
  const serverResponse = page.waitForResponse((response) =>
    response.status() === 200 && response.request().method() === "POST" &&
    new URL(response.url()).origin === base && new URL(response.url()).pathname.startsWith("/_serverFn/"),
    { timeout: 15_000 },
  );
  await page.getByRole("button", { name: "Senden", exact: true }).click();
  await serverResponse;
  await page.waitForFunction((count) => document.querySelectorAll('#anrufen [data-line-role="assistant"]').length > count, assistantBefore, { timeout: 15_000 });
  const assistant = await page.locator('#anrufen [data-line-role="assistant"]').last().innerText();
  assert(assistant.trim(), "Echte Serverantwort ist leer");
  assert.match(assistant, /(Öffnungszeit|Unsere Zeiten|Montag|geschlossen)/i, "Antwort bezieht sich nicht auf die Öffnungszeitenfrage");
  const source = await page.locator("#anrufen #sprechen-llm-source").innerText().catch(() => "");
  assert.match(source, /Lokal/i, `Antwortquelle ist nicht lokal: ${source}`);
  await page.screenshot({ path: screenshot, fullPage: false });
  await context.close();
  console.log(JSON.stringify({ ok: true, route: "/#anrufen", question: "synthetische Öffnungszeitenfrage", assistantResponseVisible: true, source, audioUi, blockedExternal, screenshot }, null, 2));
} finally {
  await browser?.close().catch(() => {});
  await stop(server);
  assert(await freePort(), `Port ${port} nach Cleanup nicht frei`);
}
