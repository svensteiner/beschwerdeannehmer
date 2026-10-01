#!/usr/bin/env node
/**
 * Isolierter Produktions-E2E-Test der Telefon-Bruecke.
 * Startet Silvia mit leerer RAM-Datenbank, registriert eine synthetische
 * Ordination ueber die echte Oberflaeche und ruft die Antwort-Route mit dem
 * Python-Client des Telefon-Gateways auf. Kein SIP, kein Audio, kein Cloud-LLM.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { resolve, join } from "node:path";
import { chromium } from "playwright";

const root = resolve(process.env.SILVIA_SOURCE_ROOT || new URL("../", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
const phoneRoot = resolve(process.env.SILVIA_PHONE_ROOT || join(root, "..", "silvia-phone"));
const python = process.env.SILVIA_PYTHON || process.env.PYTHON || "python";
const token = `e2e-${crypto.randomUUID()}`;
const runId = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const practiceName = `Phone E2E ${runId}`;
const email = `phone-e2e-${runId}@example.test`;
const inbox = `intern-${runId}@example.test`;
const slug = `phone-e2e-${runId}`;
let server;
let browser;
let serverOutput = "";

function spawnLogged(command, args, options) {
  const child = spawn(command, args, { windowsHide: true, ...options });
  child.stdout?.on("data", (chunk) => { serverOutput += chunk.toString(); });
  child.stderr?.on("data", (chunk) => { serverOutput += chunk.toString(); });
  return child;
}

async function freePort() {
  const socket = net.createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(origin) {
  for (let i = 0; i < 100; i += 1) {
    if (server.exitCode !== null) throw new Error(`Produktionsserver beendete sich vorzeitig (${server.exitCode}).`);
    try {
      const response = await fetch(`${origin}/registrieren`);
      if (response.ok) return;
    } catch { /* Server startet noch. */ }
    await delay(250);
  }
  throw new Error("Produktionsserver wurde nicht rechtzeitig erreichbar.");
}

async function invokePhoneClient(history, callId, ended = false) {
  const script = [
    "import json, sys",
    "from lib.silvia_client import ask_silvia_api, notify_call_ended",
    "history = json.loads(sys.argv[1])",
    "call_id, url, token, ended = sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] == '1'",
    "if ended:",
    "    ok = notify_call_ended(history, url, token, call_id, '00436601234567')",
    "    print(json.dumps({'notified': ok}))",
    "else:",
    "    reply, end_call = ask_silvia_api(history, url, token, call_id, '00436601234567')",
    "    print(json.dumps({'reply': reply, 'endCall': end_call}))",
  ].join("\n");
  const result = spawn(python, ["-c", script, JSON.stringify(history), callId,
    `${origin}/api/telefon/antwort`, token, ended ? "1" : "0"], {
    cwd: phoneRoot,
    windowsHide: true,
    env: { ...process.env, HTTP_PROXY: "", HTTPS_PROXY: "", ALL_PROXY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  result.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  result.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const [code] = await once(result, "close");
  assert.equal(code, 0, `Telefon-Client fehlgeschlagen: ${stderr}`);
  return JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
}

let origin;
try {
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    SILVIA_LOCAL_NITRO: "1",
    SILVIA_DATA_DIR: "memory",
    DATABASE_URL: "",
    SILVIA_PHONE_TOKEN: token,
    SILVIA_PHONE_LINE: slug,
    SILVIA_LLM_PROVIDER: "local",
    SILVIA_LLM_BASE_URL: "",
    OPENAI_API_KEY: "",
    XAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    GEMINI_API_KEY: "",
    HOST: "127.0.0.1",
    NITRO_HOST: "127.0.0.1",
    PORT: String(port),
    NITRO_PORT: String(port),
  };
  assert.ok(await import("node:fs/promises").then(({ stat }) => stat(join(root, ".output", "server", "index.mjs"))),
    "Isolierter Produktionsbuild muss vor dem Gateway-Test vorhanden sein.");
  server = spawnLogged(process.execPath, [".output/server/index.mjs"], {
    cwd: root, env, stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(origin);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => { serverOutput += `\n[pageerror] ${error.message}`; });
  page.on("console", (message) => {
    if (message.type() === "error") serverOutput += `\n[page-console-error] ${message.text()}`;
  });
  const postResponses = [];
  page.on("response", (response) => {
    if (response.request().method() === "POST") {
      const record = {
        path: new URL(response.url()).pathname,
        status: response.status(),
        contentType: response.headers()["content-type"]?.split(";")[0] ?? "",
      };
      void response.json().then((body) => {
        record.responseShape = {
          keys: body && typeof body === "object" ? Object.keys(body) : [],
          ok: typeof body?.ok === "boolean" ? body.ok : undefined,
          errorType: typeof body?.error === "string" ? "string" : undefined,
        };
        postResponses.push(record);
      }).catch(() => {
        record.responseShape = "non-json";
        postResponses.push(record);
      });
    }
  });
  await page.goto(`${origin}/registrieren`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.readyState === "complete" &&
    Boolean(document.querySelector("#desk-register-form button:not([disabled])")));
  await page.locator("#practice").fill(practiceName);
  await page.locator("#name").fill("Dr. Test");
  await page.locator("#city").fill("Graz");
  await page.locator("#bundesland").selectOption({ label: "Steiermark" });
  await page.locator("#street").fill("Testgasse 1");
  await page.locator("#zip").fill("8010");
  await page.locator("#parkplatz").fill("Parkplatz beim Testhaus");
  await page.locator("#email").fill(email);
  await page.locator("#inbox").fill(inbox);
  await page.locator("#password").fill("synthetic-e2e-password-72");
  await page.locator("#phone").fill("0316 555 0101");
  await page.locator("#whatsapp").fill("0664 555 0101");
  await page.locator("#nachtdienst").fill("0316 555 0202");
  await page.locator("#desk-register-form button[type=submit]").click();
  try {
    await page.waitForURL(/\/app(?:$|\/)/, { timeout: 60000 });
  } catch {
    const notices = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
    const formState = await page.locator("#desk-register-form").evaluate((form) => ({
      valid: form.checkValidity(),
      invalidFields: [...form.querySelectorAll(":invalid")].map((field) => field.id || field.tagName),
      submitDisabled: form.querySelector("button[type=submit]")?.disabled ?? null,
    }));
    await delay(100);
    throw new Error(`Synthetische Registrierung endete nicht auf der Tafel (URL=${page.url()}, Formular sichtbar=${await page.locator("#desk-register-form").isVisible()}, Zustand=${JSON.stringify(formState)}, POST=${JSON.stringify(postResponses)}, Hinweise=${notices.join(" | ") || "keine"}).`);
  }

  const apiUrl = `${origin}/api/telefon/antwort`;
  const callId = `phone-e2e-${runId}`;
  const history = [{ role: "user", content: "Ich brauche bitte die Öffnungszeiten." }];
  const first = await invokePhoneClient(history, callId);
  assert.ok(first.reply, "Silvia muss eine Antwort liefern.");

  // Derselbe Gateway-Turn muss aus der echten Datenbank idempotent bedient werden.
  const retry = await invokePhoneClient(history, callId);
  assert.equal(retry.reply, first.reply, "Retry muss die gespeicherte Antwort zurückgeben.");

  const ended = await invokePhoneClient([
    ...history,
    { role: "assistant", content: first.reply },
  ], callId, true);
  assert.equal(ended.notified, true, "Gateway-Auflege-Ping muss angenommen werden.");

  console.info(`[phone-gateway-e2e] OK: synthetische Praxis, Antwort, Retry und Auflege-Ping (${apiUrl}).`);
} catch (error) {
  console.error(`[phone-gateway-e2e] FEHLER: ${error.stack || error}`);
  if (serverOutput) console.error(serverOutput.slice(-5000));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (server && server.exitCode === null) {
    server.kill();
    await Promise.race([once(server, "close"), delay(5000)]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
}
