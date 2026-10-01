#!/usr/bin/env node
/**
 * Isolierter Browser-Audit fuer den ersten Praxis-Onboarding-Fluss.
 *
 * Der Audit startet den isolierten Produktionsserver mit RAM-Datenbank, registriert
 * eine rein synthetische Praxis, prueft Abmelden/erneutes Anmelden und die
 * ersten sichtbaren Einstellungen. Fremde Origins werden abgebrochen.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { chromium } from "playwright";

const port = 8191;
const baseUrl = `http://127.0.0.1:${port}`;
const email = "onboarding-audit@example.test";
const password = "Onboarding-Audit-2026!";
let server;
const serverLog = [];

function isPortFree(target) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(target, "127.0.0.1");
  });
}

async function waitForServer() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Produktionsserver beendet (${server.exitCode}).`);
    try {
      const response = await fetch(`${baseUrl}/registrieren`, { signal: AbortSignal.timeout(3_000) });
      if (response.ok) return;
    } catch { /* Der Produktionsserver startet noch. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Onboarding-Server auf Port ${port} wurde nicht bereit.`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  if (process.platform === "win32" && server.pid) {
    const killer = spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    await new Promise((resolve) => { killer.once("exit", resolve); killer.once("error", resolve); });
  } else {
    server.kill("SIGTERM");
  }
}

async function main() {
  assert(await isPortFree(port), `Port ${port} ist belegt; fremder Prozess wird nicht veraendert.`);
  server = spawn(process.execPath, [".output/server/index.mjs"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec,
      TEMP: process.env.TEMP, TMP: process.env.TMP, USERPROFILE: process.env.USERPROFILE,
      LOCALAPPDATA: process.env.LOCALAPPDATA, APPDATA: process.env.APPDATA, ProgramData: process.env.ProgramData,
      HOST: "127.0.0.1", PORT: String(port), NITRO_PORT: String(port), NITRO_HOST: "127.0.0.1", VITE_AUTH_ENABLED: "false",
      SILVIA_DATA_DIR: "memory", DATABASE_URL: "", SILVIA_LLM_PROVIDER: "local",
      OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", KIMI_API_KEY: "", GEMINI_API_KEY: "", XAI_API_KEY: "",
      SILVIA_LLM_BASE_URL: "", SILVIA_LIVE_DEMO_ENABLED: "0", SILVIA_BOOKING: "",
      SILVIA_STT_URL: "", SILVIA_TTS_URL: "", OLLAMA_HOST: "",
      HTTP_PROXY: "", HTTPS_PROXY: "", ALL_PROXY: "", NODE_USE_ENV_PROXY: "0",
    },
    stdio: "pipe", windowsHide: true,
  });
  server.stdout.on("data", (chunk) => serverLog.push(String(chunk)));
  server.stderr.on("data", (chunk) => serverLog.push(String(chunk)));
  await waitForServer();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const externalRequests = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== baseUrl) {
      externalRequests.push(request.url());
      return route.abort();
    }
    return route.fallback();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const requestLog = [];
  page.on("response", (response) => {
    if (response.request().method() === "POST") requestLog.push(`${response.status()} ${response.url()}`);
  });
  try {
    await page.goto(`${baseUrl}/registrieren`, { waitUntil: "domcontentloaded" });
    await page.locator("#desk-register-form").waitFor();
    await page.waitForFunction(() => document.readyState === "complete" && Boolean(document.querySelector("#desk-register-form button:not([disabled])")));
    assert.equal(await page.locator("#desk-register-form input").count() > 0, true, "Registrierungsfelder fehlen.");
    const fields = {
      practice: "Audit Tierordination",
      name: "Dr. Audit Test",
      city: "Graz",
      street: "Auditgasse 7",
      zip: "8010",
      parkplatz: "Parkplatz am Hof",
      email,
      inbox: "intern-audit@example.test",
      password,
      phone: "0316 555 0101",
      whatsapp: "0664 555 0101",
      nachtdienst: "0316 555 0202",
    };
    for (const [id, value] of Object.entries(fields)) await page.locator(`#${id}`).fill(value);
    await page.locator("#bundesland").selectOption({ label: "Steiermark" });
    await page.locator('#desk-register-form button[type="submit"]').click();
    await page.waitForURL(/\/app(?:$|\/)/, { timeout: 60_000 }).catch(async (error) => {
      const validity = await page.locator("#desk-register-form").evaluate((form) => ({
        valid: form.checkValidity(),
        invalid: [...form.querySelectorAll("input,select")].filter((el) => !el.checkValidity()).map((el) => ({ id: el.id, value: el.value, required: el.required })),
      })).catch(() => null);
      throw new Error(`${error.message}; URL=${page.url()}; VALIDITY=${JSON.stringify(validity)}; POSTS=${requestLog.join(",")}; BODY=${(await page.locator("body").innerText()).slice(-1200)}`);
    });
    await page.locator("main").waitFor();
    await page.goto(`${baseUrl}/app/einstellungen`, { waitUntil: "domcontentloaded" });
    await page.locator("#name").waitFor();
    assert.equal(await page.locator("#name").inputValue(), "Audit Tierordination", "Praxisname fehlt nach Registrierung.");
    assert.equal(await page.locator("#city").inputValue(), "Graz", "Ort fehlt nach Registrierung.");
    await page.getByRole("button", { name: "Abmelden" }).click();
    await page.waitForURL(/\/$/, { waitUntil: "domcontentloaded" });
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.locator("#desk-login-submit").waitFor();
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await Promise.all([
      page.waitForURL(/\/app(?:$|\/)/, { waitUntil: "domcontentloaded" }),
      page.locator("#desk-login-submit").click(),
    ]);
    await page.goto(`${baseUrl}/app`, { waitUntil: "domcontentloaded" });
    await Promise.all([
      page.waitForURL(/\/app\/training$/, { waitUntil: "domcontentloaded" }),
      page.getByRole("link", { name: "Training", exact: true }).click(),
    ]);
    await page.getByRole("heading", { name: "Silvia Schritt für Schritt einlernen" }).waitFor();
    await page.waitForLoadState("networkidle");
    const trainingText = await page.locator("body").innerText();
    assert.match(trainingText, /Audit Tierordination/, "Training zeigt nicht die registrierte Praxis.");
    assert.match(trainingText, /Graz/, "Training zeigt nicht den registrierten Ort.");
    assert.match(trainingText, /Praxiswissen · sprechen/i, "Rubrik Praxiswissen/Sprechen fehlt.");
    assert.match(trainingText, /Praxiswissen · tippen/i, "Rubrik Praxiswissen/Tippen fehlt.");
    assert.match(trainingText, /Spracherkennung/i, "Rubrik Spracherkennung fehlt.");
    const syntheticRule = "Audit-Regel: Mittwoch nur Kontrolltermine.";
    await page.locator("textarea").nth(0).fill(syntheticRule);
    await page.getByRole("button", { name: "Hinweis speichern", exact: true }).click();
    await page.getByText(syntheticRule, { exact: true }).waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText(syntheticRule, { exact: true }).waitFor();
    await page.waitForLoadState("networkidle");
    const syntheticBehavior = "Audit-Ton: freundlich und knapp.";
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Ton und Verhalten speichern") && !button.disabled));
    await page.locator("textarea").nth(1).fill(syntheticBehavior);
    await page.getByRole("button", { name: "Ton und Verhalten speichern", exact: true }).click();
    await page.locator("[data-sonner-toast]").filter({ hasText: "Ton und Verhalten gespeichert." }).waitFor({ state: "attached" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("textarea").nth(1).waitFor();
    await page.waitForFunction((expected) => document.querySelectorAll("textarea")[1]?.value === expected, syntheticBehavior, { timeout: 10_000 });
    assert.equal(await page.locator("textarea").nth(1).inputValue(), syntheticBehavior, "Ton/Verhalten wurde nicht persistiert.");
    await page.waitForLoadState("networkidle");
    await page.getByText(syntheticRule, { exact: true }).locator("xpath=ancestor::li").getByRole("button", { name: "Löschen", exact: true }).click();
    await page.locator("[data-sonner-toast]").filter({ hasText: "Hinweis gelöscht." }).waitFor({ state: "attached" });
    await page.getByText("Noch keine Praxisregel hinterlegt.", { exact: true }).waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Noch keine Praxisregel hinterlegt.", { exact: true }).waitFor();
    assert.equal(await page.getByText(syntheticRule, { exact: true }).count(), 0, "Gelöschte Testregel ist nach Reload noch vorhanden.");
    assert.deepEqual(externalRequests, [], "Onboarding darf keine externe Anfrage ausloesen.");
    console.log(JSON.stringify({ ok: true, port, checks: ["synthetische Erstregistrierung", "Einstellungen nach Registrierung", "Abmelden", "erneutes Anmelden", "Training ueber sichtbare Navigation", "Praxiszuordnung im Training", "getrennte Trainingsrubriken", "getippte Praxisregel gespeichert und nach Reload sichtbar", "Ton und Verhalten gespeichert und nach Reload sichtbar", "Testregel gelöscht und nach Reload entfernt", "externe Anfragen blockiert"] }, null, 2));
  } finally {
    await context.close();
    await browser.close();
    await stopServer();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), serverLog: serverLog.join("").slice(-3000) }, null, 2));
  process.exitCode = 1;
});
