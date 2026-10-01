import assert from "node:assert/strict";
import { createConnection } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { once } from "node:events";
import { chromium } from "playwright";
import { PGlite } from "@electric-sql/pglite";
import { defaultSerovalPlugins } from "@tanstack/router-core";
import { fromCrossJSON } from "seroval";

const root = resolve(process.cwd());
const host = "127.0.0.1";
const port = 8094;
const origin = `http://${host}:${port}`;
const entry = join(root, ".output", "server", "index.mjs");
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
async function portUsed() {
  return new Promise((done) => {
    const socket = createConnection({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      done(true);
    });
    socket.once("error", () => done(false));
  });
}
function metadata() {
  assert.ok(existsSync(entry), `Build fehlt: ${entry}`);
  const source = readFileSync(entry, "utf8");
  const matches = [...source.matchAll(/createServerRpc\(\{\s*id:\s*"([^"]+)"\s*,\s*name:\s*"submitLead"\s*,\s*filename:\s*"([^"]+)"/g)];
  assert.equal(matches.length, 1, "submitLead-Metadaten müssen genau einmal im erzeugten Build vorkommen");
  const match = matches[0];
  assert.equal(match[2], "src/lib/practice/leads.ts");
  const base = source.match(/SERVER_FN_BASE\s*=\s*"([^"]+)"/);
  assert.ok(base, "SERVER_FN_BASE fehlt im erzeugten Build");
  return { id: match[1], filename: match[2], base: base[1] };
}
function startServer(dataDir) {
  const child = spawn(process.execPath, [entry], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port),
      SILVIA_DATA_DIR: dataDir,
      DATABASE_URL: "",
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      SILVIA_LIVE_DEMO_ENABLED: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  return { child, logs };
}
async function waitForListening(server) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) throw new Error(`Server beendet: ${server.child.exitCode}\n${server.logs.join("")}`);
    if (server.logs.join("").includes(`Listening on: http://${host}:${port}/`)) return;
    await delay(200);
  }
  throw new Error(`Server lauscht nicht innerhalb des Timeouts auf ${origin}\n${server.logs.join("")}`);
}
async function stopServer(server) {
  if (!server) return;
  if (server.child.exitCode === null && server.child.signalCode === null) {
    server.child.kill();
    await Promise.race([once(server.child, "exit"), delay(2_000)]);
  }
  if (server.child.exitCode === null && server.child.signalCode === null) {
    server.child.kill("SIGKILL");
    await Promise.race([once(server.child, "exit"), delay(2_000)]);
  }
  assert.ok(server.child.exitCode !== null || server.child.signalCode !== null, "Server läuft noch");
}
async function inspectDatabase(dataDir, expected, id) {
  const db = new PGlite(dataDir);
  try {
    const lead = await db.query("select id, practice_name, contact, email, phone, bundesland, pms, message from leads");
    assert.equal(lead.rows.length, 1, "Es muss genau ein Lead gespeichert sein");
    assert.deepEqual(lead.rows[0], { id, ...expected });
    for (const table of ["practices", "patients", "appointments", "calls", "threads", "mails"]) {
      const result = await db.query(`select count(*)::int as count from ${table}`);
      assert.equal(result.rows[0].count, 0, `${table} darf keine Zeile enthalten`);
    }
    return {
      lead: lead.rows[0],
      emptyTables: ["practices", "patients", "appointments", "calls", "threads", "mails"],
    };
  } finally {
    await db.close();
  }
}
async function browserAudit(meta) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const exactPostPath = `${meta.base}${meta.id}`;
  let firstFailure = true;
  let postCommitFailure = true;
  let postCommitReturnedId = null;
  let postCount = 0;
  let blocked = 0;
  try {
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const localGet = url.origin === origin && request.method() === "GET";
      const exactPost = url.origin === origin && request.method() === "POST" && url.pathname === exactPostPath;
      if (!localGet && !exactPost) {
        blocked += 1;
        return route.abort();
      }
      if (exactPost) {
        postCount += 1;
        if (firstFailure) {
          firstFailure = false;
          return route.fulfill({ status: 503, body: "unavailable" });
        }
        if (postCommitFailure) {
          postCommitFailure = false;
          const browserRequest = request;
          const forwarded = await new Promise((resolve, reject) => {
            let settled = false;
            const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(value); };
            const outbound = httpRequest(browserRequest.url(), { method: "POST", headers: browserRequest.headers() }, (response) => {
              const chunks = [];
              response.on("data", (chunk) => chunks.push(chunk));
              response.once("error", (error) => finish(error));
              response.once("aborted", () => finish(new Error("weitergeleitete Antwort abgebrochen")));
              response.once("end", () => {
                try {
                  const text = Buffer.concat(chunks).toString("utf8");
                  const body = JSON.parse(text);
                  const decoded = response.headers["x-tss-serialized"] === "true" ? fromCrossJSON(body, { plugins: defaultSerovalPlugins }) : body;
                  finish(null, { status: response.statusCode, result: decoded?.result ?? decoded });
                } catch (error) { finish(error); }
              });
            });
            const timer = setTimeout(() => { outbound.destroy(); finish(new Error("weitergeleiteter POST Timeout")); }, 15_000);
            outbound.once("error", (error) => finish(error));
            outbound.end(browserRequest.postData() || "");
          });
          assert.equal(forwarded.status, 200, "Der kontrollierte After-Commit-POST erreichte den Server nicht erfolgreich");
          assert.equal(forwarded.result?.ok, true, "Der kontrollierte After-Commit-POST meldete keinen fachlichen Erfolg");
          postCommitReturnedId = forwarded.result.id;
          return route.fulfill({ status: 503, body: "response lost after commit" });
        }
      }
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(`${origin}/`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    const trigger = page.getByRole("button", { name: /Demo anfragen|Demo und Test besprechen/i }).first();
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const bundesland = dialog.locator("#bundesland");
    const pms = dialog.locator("#pms");
    const selectedBundesland = await bundesland.locator("option").nth(1).getAttribute("value");
    const selectedPms = await pms.locator("option").filter({ hasText: "Vquadrat Veterinär" }).getAttribute("value");
    assert.ok(selectedBundesland);
    assert.ok(selectedPms);
    await bundesland.selectOption(selectedBundesland);
    await pms.selectOption(selectedPms);
    const expected = {
      practice_name: "Audit Demoordination",
      contact: "Eva Beispiel",
      email: "eva@example.test",
      phone: "+431234567",
      bundesland: selectedBundesland,
      pms: selectedPms,
      message: "Isolierter Retry-Test",
    };
    await dialog.locator("#practice").fill(expected.practice_name);
    await dialog.locator("#contact").fill(expected.contact);
    await dialog.locator("#email").fill(expected.email);
    await dialog.locator("#phone").fill(expected.phone);
    await dialog.locator("#message").fill(expected.message);
    const submit = dialog.locator('button[type="submit"]');
    await submit.click();
    await page
      .locator("[data-sonner-toast]")
      .filter({ hasText: /Anfrage konnte nicht gespeichert werden/i })
      .waitFor({ timeout: 5_000 });
    assert.equal(await submit.isEnabled(), true);
    for (const [field, value] of [
      ["practice", expected.practice_name],
      ["contact", expected.contact],
      ["email", expected.email],
      ["phone", expected.phone],
      ["bundesland", selectedBundesland],
      ["pms", selectedPms],
      ["message", expected.message],
    ])
      assert.equal(await dialog.locator(`#${field}`).inputValue(), value);
    await submit.click();
    await page.locator('[data-sonner-toast]').filter({ hasText: /Anfrage konnte nicht gespeichert werden/i }).waitFor({ timeout: 5_000 });
    await page.waitForFunction(() => {
      const button = document.querySelector('[role="dialog"] button[type="submit"]');
      return button instanceof HTMLButtonElement && !button.disabled;
    }, undefined, { timeout: 5_000 });
    const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === exactPostPath && response.request().method() === "POST", {
      timeout: 10_000,
    });
    await submit.click();
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    const body = await response.json();
    const decoded = response.headers()["x-tss-serialized"] === "true" ? fromCrossJSON(body, { plugins: defaultSerovalPlugins }) : body;
    const result = decoded?.result ?? decoded;
    assert.equal(result?.ok, true);
    assert.match(result.id, /^[a-f0-9]{32}$/);
    assert.equal(result.id, postCommitReturnedId, "Der normale Retry muss die ID des verlorenen erfolgreichen Commits wiedergeben");
    await dialog.getByText("Danke, wir melden uns.").waitFor();
    const returnedId = result.id;
    await dialog.getByRole("button", { name: "Schließen", exact: true }).first().click();
    await trigger.click();
    const reopened = page.getByRole("dialog");
    assert.equal(await reopened.locator("#practice").inputValue(), "");
    for (const field of ["contact", "email", "phone", "bundesland", "message"]) assert.equal(await reopened.locator(`#${field}`).inputValue(), "");
    assert.equal(await reopened.locator("#pms").inputValue(), selectedPms);
    assert.equal(postCount, 3);
    return {
      expected,
      returnedId,
      postCommitReturnedId,
      postCount,
      responseStatus: 200,
      blockedRequests: blocked,
    };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
async function main() {
  assert.equal(await portUsed(), false, `${origin} ist bereits belegt; fremder Prozess bleibt unangetastet`);
  const meta = metadata();
  const dataDir = await mkdtemp(join(tmpdir(), "silvia-lead-audit-"));
  let server;
  try {
    server = startServer(dataDir);
    console.error(`[lead-request-audit] server pid=${server.child.pid} port=${port} dataDir=${dataDir}`);
    await waitForListening(server);
    const browser = await browserAudit(meta);
    await stopServer(server);
    const checked = await inspectDatabase(dataDir, browser.expected, browser.returnedId);
    console.log(JSON.stringify({ ok: true, port, metadata: meta, browser, database: checked }, null, 2));
  } finally {
    await stopServer(server);
    const safe = resolve(dataDir);
    const base = resolve(tmpdir());
    const rel = relative(base, safe);
    assert.ok(rel && rel !== "." && !rel.startsWith(".."), "Unsicheres Temp-Cleanup-Ziel");
    await rm(safe, { recursive: true, force: true });
  }
}
await main();
