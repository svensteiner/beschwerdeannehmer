#!/usr/bin/env node
/**
 * Browser proof for practice_facts tenant isolation.
 *
 * Uses a disposable, on-disk PGLite database and a private Vite process.  The
 * assertions intentionally replay the POST body observed from the running
 * application instead of relying on TanStack's generated server-function ids.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { chromium } from "playwright";
import { defaultSerovalPlugins } from "@tanstack/router-core";
import { fromCrossJSON } from "seroval";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 8094;
const baseUrl = `http://127.0.0.1:${port}`;
const password = "Isolation-2026!";
const ids = {
  aPractice: "audit-practice-a",
  bPractice: "audit-practice-b",
  aUser: "audit-user-a",
  bUser: "audit-user-b",
  aFact: "audit-fact-a",
  bFact: "audit-fact-b",
  aPatient: "audit-patient-a",
  bPatient: "audit-patient-b",
  aAppointment: "audit-appointment-a",
  bAppointment: "audit-appointment-b",
  aCall: "audit-call-a",
  bCall: "audit-call-b",
  aThread: "audit-thread-a",
  bThread: "audit-thread-b",
  aMail: "audit-mail-a",
  bMail: "audit-mail-b",
  aEmergency: "audit-emergency-a",
  bEmergency: "audit-emergency-b",
};
let tempDir;
let server;
let dataDir;
let keepTemp = false;
const serverLog = [];

function passwordHash(value) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(value, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt}$${key.toString("hex")}`;
}

function isPortFree(portToCheck) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(portToCheck, "127.0.0.1");
  });
}

async function waitForServer(child) {
  const until = Date.now() + 45_000;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`Vite beendet (${child.exitCode}).`);
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok) return;
    } catch {
      // The isolated server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Der isolierte Vite-Server auf Port 8094 wurde nicht bereit.");
}

async function seedDatabase(dataDir) {
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
      await db.query(
        `insert into practices (id, name, owner_name, email) values ($1, $2, $3, $4)`,
        [practiceId, `Audit Praxis ${side.toUpperCase()}`, `Audit ${side.toUpperCase()}`, `audit-${side}@example.test`],
      );
      await db.query(
        `insert into practice_users (id, practice_id, email, password_hash, name, role)
         values ($1, $2, $3, $4, $5, 'inhaberin')`,
        [userId, practiceId, `audit-${side}@example.test`, passwordHash(password), `Audit ${side.toUpperCase()}`],
      );
      await db.query(
        "insert into practice_facts (id, practice_id, fact) values ($1, $2, $3)",
        [ids[`${side}Fact`], practiceId, `Nur Praxis ${side.toUpperCase()}: vertrauliche Regel.`],
      );
      if (process.env.PATIENT_ISOLATION_AUDIT === "1" || process.env.PROTOCOL_ISOLATION_AUDIT === "1") {
        await db.query(
          `insert into patients (id, practice_id, name, species, owner_name, phone, email, notes, source)
           values ($1, $2, $3, 'Hund', $4, $5, $6, $7, 'audit')`,
          [
            ids[`${side}Patient`],
            practiceId,
            process.env.PROTOCOL_ISOLATION_AUDIT === "1" ? "Gleicher Hund" : `Audit Patient ${side.toUpperCase()}`,
            process.env.PROTOCOL_ISOLATION_AUDIT === "1" ? `Kontakt ${side.toUpperCase()}` : `Audit Halter ${side.toUpperCase()}`,
            `+4366012345${side === "a" ? "1" : "2"}`,
            process.env.PROTOCOL_ISOLATION_AUDIT === "1" ? `kontakt-${side}@example.test` : `audit-${side}@example.test`,
            `Nur Praxis ${side.toUpperCase()}: Patientenakte.`,
          ],
        );
      }
      if (process.env.APPOINTMENT_ISOLATION_AUDIT === "1") {
        await db.query(
          `insert into appointments (id, practice_id, start_at, minutes, owner_name, pet, kind, vet, channel)
           values ($1, $2, '2099-01-05T09:00:00Z', 20, $3, $4, 'Kontrolle', '', 'telefon')`,
          [ids[`${side}Appointment`], practiceId, `Audit Halter ${side.toUpperCase()}`, `Audit Tier ${side.toUpperCase()}`],
        );
      }
      if (process.env.PROTOCOL_ISOLATION_AUDIT === "1") {
        const samePet = "Gleicher Hund";
        await db.query(
          `insert into calls (id, practice_id, caller, pet, species, concern, status, transcript, action)
           values ($1, $2, $3, $4, 'Hund', $5, 'offen', $6::jsonb, $7)`,
          [ids[`${side}Call`], practiceId, `Audit Halter ${side.toUpperCase()}`, samePet,
            `Nur Praxis ${side.toUpperCase()}: Anliegen`, JSON.stringify([{ text: `Kontakt ${side.toUpperCase()}` }]), `Aktion ${side.toUpperCase()}`],
        );
        await db.query(
          `insert into threads (id, practice_id, name, pet, preview, unread, intern, messages)
           values ($1, $2, $3, $4, $5, 1, false, $6::jsonb)`,
          [ids[`${side}Thread`], practiceId, `Audit Halter ${side.toUpperCase()}`, samePet,
            `Nur Praxis ${side.toUpperCase()}: Vorschau`, JSON.stringify([{ text: `Nachricht ${side.toUpperCase()}` }])],
        );
        await db.query(
          `insert into mails (id, practice_id, to_addr, subject, body, pet)
           values ($1, $2, $3, $4, $5, $6)`,
          [ids[`${side}Mail`], practiceId, `mail-${side}@example.test`, `Betreff ${side.toUpperCase()}`,
            `Nur Praxis ${side.toUpperCase()}: Mailtext`, samePet],
        );
      }
      if (process.env.EMERGENCY_ISOLATION_AUDIT === "1") {
        await db.query(
          `insert into emergencies (id, practice_id, owner_name, pet, species, summary, urgency, routed_to, status)
           values ($1, $2, $3, $4, 'Hund', $5, 'sofort', 'Audit Nachtdienst', 'neu')`,
          [ids[`${side}Emergency`], practiceId, `Audit Notfallhalter ${side.toUpperCase()}`,
            `Audit Notfalltier ${side.toUpperCase()}`, `Nur Praxis ${side.toUpperCase()}: Notfallmarker`],
        );
      }
    }
  } finally {
    await db.close();
  }
}

async function login(page, side) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  // Vite compiles the client route lazily; SSR has already rendered the form
  // before React attaches its submit handler.
  await page.waitForTimeout(8_000);
  await page.locator("#email").fill(`audit-${side}@example.test`);
  await page.locator("#password").fill(password);
  const post = page.waitForResponse((response) => response.request().method() === "POST", { timeout: 10_000 });
  await page.locator("#desk-login-submit").click();
  let response;
  try {
    response = await post;
    await page.waitForURL(/\/app/, { timeout: 10_000 });
  } catch (error) {
    const body = await page.locator("body").innerText().catch(() => "");
    const button = await page.locator("#desk-login-submit").evaluate((element) => ({ disabled: element.disabled, html: element.outerHTML })).catch(() => null);
    throw new Error(`Login ${side.toUpperCase()} fehlgeschlagen: ${error instanceof Error ? error.message : error}; POST=${response ? `${response.status()} ${response.url()}` : "keiner"}; Button=${JSON.stringify(button)}; Seite=${body.slice(0, 500)}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function factRequest(requests, marker) {
  const request = requests.find((item) => item.body.includes(marker));
  assert(request, `Kein beobachteter Fakten-POST für ${marker}.`);
  return request;
}

function observedRequest(request) {
  return {
    url: request.url(),
    body: request.postData() || "",
    headers: Object.fromEntries(Object.entries(request.headers()).filter(([key]) => !["host", "content-length", "cookie", "origin", "referer", "user-agent", "connection", "accept-encoding"].includes(key) && !key.startsWith("sec-"))),
  };
}

function replacePayload(body, from, to) {
  assert(body.includes(from), `Die beobachtete Anfrage enthält ${from} nicht.`);
  return body.replaceAll(from, to);
}

async function deserializeServerFnResponse(response) {
  const body = await response.json();
  return response.headers()["x-tss-serialized"] === "true"
    ? fromCrossJSON(body, { plugins: defaultSerovalPlugins })
    : body;
}

async function replayFromPage(page, observed, body) {
  return page.evaluate(async ({ url, headers, postBody }) => {
    const response = await fetch(url, { method: "POST", headers, body: postBody, credentials: "same-origin" });
    return { status: response.status, text: await response.text(), serialized: response.headers.get("x-tss-serialized") === "true" };
  }, { url: observed.url, headers: observed.headers, postBody: body });
}

async function replayWithoutCookies(page, observed, body) {
  return page.evaluate(async ({ url, headers, postBody }) => {
    const response = await fetch(url, { method: "POST", headers, body: postBody, credentials: "omit" });
    return { status: response.status, text: await response.text(), serialized: response.headers.get("x-tss-serialized") === "true" };
  }, { url: observed.url, headers: observed.headers, postBody: body });
}

async function waitForOwnUpdatedText(page, expectedText) {
  await page.getByText(expectedText).waitFor({ timeout: 15_000 });
}

function decodeReplay(result) {
  if (!result.serialized) return JSON.parse(result.text);
  return fromCrossJSON(JSON.parse(result.text), { plugins: defaultSerovalPlugins });
}

async function patientRows(dataDir) {
  const db = new PGlite({ dataDir });
  await db.waitReady;
  try {
    const rows = await db.query("select * from patients order by id");
    return rows.rows;
  } finally {
    await db.close();
  }
}

async function appointmentRows(dataDir) {
  const db = new PGlite({ dataDir });
  await db.waitReady;
  try {
    const rows = await db.query("select * from appointments order by id");
    return rows.rows;
  } finally {
    await db.close();
  }
}

async function protocolRows(dataDir) {
  const db = new PGlite({ dataDir });
  await db.waitReady;
  try {
    const calls = await db.query("select * from calls order by id");
    const threads = await db.query("select * from threads order by id");
    const mails = await db.query("select * from mails order by id");
    const patients = await db.query("select * from patients order by id");
    return { calls: calls.rows, threads: threads.rows, mails: mails.rows, patients: patients.rows };
  } finally { await db.close(); }
}

async function countFacts(dataDir) {
  const db = new PGlite({ dataDir });
  await db.waitReady;
  try {
    const rows = await db.query("select id, practice_id, fact from practice_facts order by id");
    return rows.rows;
  } finally {
    await db.close();
  }
}

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  assert(server.exitCode !== null || server.signalCode !== null, "Testserver noch aktiv; Datenbankzugriff und Bereinigung bleiben gesperrt.");
}

async function main() {
  assert(await isPortFree(port), "Port 8094 ist belegt; der Isolationstest startet keinen fremden Prozess.");
  assert(!(process.env.PATIENT_ISOLATION_AUDIT === "1" && process.env.PROTOCOL_ISOLATION_AUDIT === "1"), "PATIENT_ISOLATION_AUDIT und PROTOCOL_ISOLATION_AUDIT dürfen wegen gemeinsamer Fixtures nicht gleichzeitig aktiv sein.");
  tempDir = await mkdtemp(join(tmpdir(), "silvia-isolation-audit-"));
  dataDir = join(tempDir, "pglite");
  await seedDatabase(dataDir);
  const patientSnapshotBefore = process.env.PATIENT_ISOLATION_AUDIT === "1" ? await patientRows(dataDir) : [];
  const appointmentSnapshotBefore = process.env.APPOINTMENT_ISOLATION_AUDIT === "1" ? await appointmentRows(dataDir) : [];
  const protocolSnapshotBefore = process.env.PROTOCOL_ISOLATION_AUDIT === "1" ? await protocolRows(dataDir) : null;
  console.log("[isolation] fixture seeded");
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: { ...process.env, VITE_AUTH_ENABLED: "false", SILVIA_DATA_DIR: dataDir, DATABASE_URL: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", SILVIA_LLM_BASE_URL: "", SILVIA_LIVE_DEMO_ENABLED: "0" },
    stdio: "pipe",
    windowsHide: true,
  });
  server.stdout.on("data", (chunk) => serverLog.push(String(chunk)));
  server.stderr.on("data", (chunk) => serverLog.push(String(chunk)));
  await waitForServer(server);
  console.log("[isolation] isolated server ready");

  const browser = await chromium.launch({ headless: true });
  const auditAfterCommit = process.env.FACTS_AUDIT_AFTER_COMMIT === "1";
  const auditReplaceRetry = process.env.FACTS_AUDIT_REPLACE_RETRY === "1";
  let firstCommittedFactId = null;
  let afterCommitObserved = false;
  let retryAuditIds = null;
  try {
    const a = await browser.newContext();
    const b = await browser.newContext();
    for (const context of [a, b]) {
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === baseUrl
          ? route.continue()
          : route.abort(),
      );
    }
    const aPage = await a.newPage();
    const bPage = await b.newPage();
    const browserErrors = [];
    for (const page of [aPage, bPage]) {
      page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
      });
      page.on("requestfailed", (request) => browserErrors.push(`failed: ${request.url()} ${request.failure()?.errorText || ""}`));
    }
    const bPosts = [];
    bPage.on("request", (request) => {
      if (request.method() !== "POST") return;
      const body = request.postData() || "";
      // Preserve TanStack's dynamic protocol headers as observed. Fetch itself
      // supplies forbidden browser headers (cookie, origin, sec-fetch-*).
      bPosts.push({ url: request.url(), body, headers: Object.fromEntries(Object.entries(request.headers()).filter(([key]) => !["host", "content-length", "cookie", "origin", "referer", "user-agent", "connection", "accept-encoding"].includes(key) && !key.startsWith("sec-"))) });
    });
    // No network outside the isolated Vite server: LLM, analytics and paid APIs stay unreachable.
    for (const context of [a, b]) await context.route(/^(?!http:\/\/127\.0\.0\.1:8094\/).*/, (route) => route.abort());

    try {
      await login(aPage, "a");
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : error}; Browser=${browserErrors.join(" | ").slice(0, 2000)}`);
    }
    await login(bPage, "b");
    console.log("[isolation] both UI logins succeeded");

    if (process.env.EMERGENCY_ISOLATION_AUDIT === "1") {
      const emergency = await bPage.evaluate(async ({ ids }) => {
        const desk = await import("/src/lib/practice/desk-actions.ts");
        const board = await import("/src/lib/practice/board.ts");
        const loaded = await board.loadBoard();
        return {
          board: loaded,
          foreignSearch: await desk.searchEmergencies({ data: { q: "Nur Praxis A: Notfallmarker" } }),
          ownSearch: await desk.searchEmergencies({ data: { q: "Nur Praxis B: Notfallmarker" } }),
          foreignById: await desk.loadEmergencyById({ data: { id: ids.aEmergency } }),
          ownById: await desk.loadEmergencyById({ data: { id: ids.bEmergency } }),
        };
      }, { ids });
      assert(emergency.board?.ok && emergency.board.emergencies.length === 1 && emergency.board.emergencies[0].id === ids.bEmergency,
        "Praxis B lädt über loadBoard nicht ausschließlich eigene Notfälle.");
      assert(emergency.board.emergencies[0].summary === "Nur Praxis B: Notfallmarker", "Praxis B lädt den eigenen Notfallmarker nicht korrekt.");
      assert(emergency.foreignSearch?.ok && emergency.foreignSearch.emergencies.length === 0, "Praxis B findet den Notfallmarker von Praxis A.");
      assert(emergency.ownSearch?.ok && emergency.ownSearch.emergencies.length === 1 && emergency.ownSearch.emergencies[0].id === ids.bEmergency, "Praxis B findet den eigenen Notfallmarker nicht.");
      assert(emergency.foreignById?.ok === false && emergency.foreignById.emergency === null, "Praxis B kann den Notfall von Praxis A per ID laden.");
      assert(emergency.ownById?.ok && emergency.ownById.emergency?.id === ids.bEmergency, "Praxis B kann den eigenen Notfall nicht per ID laden.");
      console.log("[isolation] emergency board/search/load A/B checked");
    }

    if (process.env.PROTOCOL_ISOLATION_AUDIT === "1") {
      const protocol = await bPage.evaluate(async ({ ids }) => {
        const desk = await import("/src/lib/practice/desk-actions.ts");
        const board = await import("/src/lib/practice/board.ts");
        return {
          foreignCalls: await desk.searchCalls({ data: { q: "Nur Praxis A" } }),
          ownCalls: await desk.searchCalls({ data: { q: "Nur Praxis B" } }),
          ownCall: await desk.loadCallById({ data: { id: ids.bCall } }),
          foreignCall: await desk.loadCallById({ data: { id: ids.aCall } }),
          callStatusForeign: await desk.updateCallStatus({ data: { id: ids.aCall, status: "erledigt" } }),
          callStatusOwn: await desk.updateCallStatus({ data: { id: ids.bCall, status: "erledigt" } }),
          foreignProtocol: await desk.searchProtocol({ data: { q: "Nur Praxis A" } }),
          ownProtocol: await desk.searchProtocol({ data: { q: "Nur Praxis B" } }),
          ownThread: await desk.loadThreadById({ data: { id: ids.bThread } }),
          foreignThread: await desk.loadThreadById({ data: { id: ids.aThread } }),
          ownMail: await desk.loadMailById({ data: { id: ids.bMail } }),
          foreignMail: await desk.loadMailById({ data: { id: ids.aMail } }),
          markForeign: await board.markThreadRead({ data: { id: ids.aThread } }),
          markOwn: await board.markThreadRead({ data: { id: ids.bThread } }),
        };
      }, { ids });
      assert(protocol.foreignCalls?.ok && protocol.foreignCalls.calls.length === 0, "Praxis B findet fremde Anrufinhalte.");
      assert(protocol.ownCalls?.ok && protocol.ownCalls.calls.length === 1 && protocol.ownCalls.calls[0].id === ids.bCall && protocol.ownCalls.calls[0].pet === "Gleicher Hund" && protocol.ownCalls.calls[0].owner_phone === "+43660123452" && protocol.ownCalls.calls[0].owner_email === "kontakt-b@example.test", "Praxis B findet den eigenen Anruf/Kontakt nicht korrekt.");
      assert(protocol.foreignCalls?.ok && protocol.foreignCalls.calls.length === 0, "Praxis B findet fremde Anrufinhalte.");
      assert(protocol.ownCall?.ok && protocol.ownCall.call.id === ids.bCall && protocol.ownCall.call.caller === "Kontakt B" && protocol.ownCall.call.owner_phone === "+43660123452" && protocol.ownCall.call.owner_email === "kontakt-b@example.test", "Eigener Anrufdetailabruf ist nicht tenant-korrekt.");
      assert(protocol.foreignCall?.ok === false && protocol.foreignCall.call === null, "Praxis B kann fremdes Anrufdetail laden.");
      assert(protocol.callStatusForeign?.ok === false && protocol.callStatusOwn?.ok === true, "Anrufstatus-Isolation ist fehlerhaft.");
      assert(protocol.foreignProtocol?.ok && protocol.foreignProtocol.threads.length === 0 && protocol.foreignProtocol.mails.length === 0, "Praxis B findet fremde Protokollinhalte.");
      assert(protocol.ownProtocol?.ok && protocol.ownProtocol.threads.length === 1 && protocol.ownProtocol.mails.length === 1, "Praxis B findet eigene Protokolle nicht vollständig.");
      assert(protocol.ownThread?.ok && protocol.ownThread.thread.id === ids.bThread && protocol.ownThread.thread.pet === "Gleicher Hund" && protocol.ownThread.thread.owner_phone === "+43660123452" && protocol.ownThread.thread.owner_email === "kontakt-b@example.test", "Eigener Threaddetailabruf/Kontakt ist nicht tenant-korrekt.");
      assert(protocol.foreignThread?.ok === false && protocol.foreignThread.thread === null, "Praxis B kann fremden Thread laden.");
      assert(protocol.ownMail?.ok && protocol.ownMail.mail.id === ids.bMail, "Eigener Maildetailabruf fehlt.");
      assert(protocol.foreignMail?.ok === false && protocol.foreignMail.mail === null, "Praxis B kann fremde Mail laden.");
      const foreignContactCalls = await bPage.evaluate(async () => (await import("/src/lib/practice/desk-actions.ts")).searchCalls({ data: { q: "kontakt-a@example.test" } }));
      const ownContactProtocol = await bPage.evaluate(async () => (await import("/src/lib/practice/desk-actions.ts")).searchProtocol({ data: { q: "kontakt-b@example.test" } }));
      const foreignContactProtocol = await bPage.evaluate(async () => (await import("/src/lib/practice/desk-actions.ts")).searchProtocol({ data: { q: "kontakt-a@example.test" } }));
      assert(foreignContactCalls?.ok && foreignContactCalls.calls.length === 0, "Fremde Kontakt-Suche liefert einen Anruf.");
      assert(ownContactProtocol?.ok && ownContactProtocol.threads.length === 1 && ownContactProtocol.mails.length === 1, "Eigene Kontakt-Suche findet Protokolle nicht.");
      assert(foreignContactProtocol?.ok && foreignContactProtocol.threads.length === 0 && foreignContactProtocol.mails.length === 0, "Fremde Kontakt-Suche liefert Protokolle.");
      const withMarker = (marker) => bPosts.filter((item) => item.body.includes(marker));
      const protocolRequests = [
        withMarker("Nur Praxis B")[0], // searchCalls
        withMarker(ids.bCall)[0], // loadCallById
        withMarker('"erledigt"').at(-1), // updateCallStatus (own request)
        withMarker("Nur Praxis B")[1], // searchProtocol
        withMarker(ids.bThread)[0], // loadThreadById
        withMarker(ids.bMail)[0], // loadMailById
        withMarker(ids.bThread).at(-1), // markThreadRead (own request)
      ];
      assert(protocolRequests.every(Boolean), "Nicht alle sieben Protokoll-POSTs wurden echt beobachtet.");
      assert(new Set(protocolRequests.map((item) => item.url)).size === 7, "Cookie-freie Kontrolle ordnet nicht sieben verschiedene Requests zu.");
      for (const observed of protocolRequests) {
        const cookieFree = await replayWithoutCookies(bPage, observed, observed.body);
        assert(cookieFree.status === 401 || cookieFree.status === 403 || cookieFree.text.includes("Unauthorized"), "Cookie-freier Protokoll-POST wurde nicht abgewiesen.");
      }
      console.log("[isolation] protocol search/load/status/read A/B checked");
    }

    if (process.env.PATIENT_ISOLATION_AUDIT === "1") {
      const patientSearchA = await bPage.evaluate(async () => {
        const mod = await import("/src/lib/practice/desk-actions.ts");
        return mod.searchPatients({ data: { q: "Audit Patient A" } });
      });
      assert(patientSearchA?.ok && patientSearchA.patients.length === 0 && patientSearchA.total === 1, "Praxis B kann den Patientenmarker von Praxis A lesen.");
      const patientSearchB = await bPage.evaluate(async () => {
        const mod = await import("/src/lib/practice/desk-actions.ts");
        return mod.searchPatients({ data: { q: "Audit Patient B" } });
      });
      assert(patientSearchB?.ok && patientSearchB.patients.length === 1 && patientSearchB.patients[0].id === ids.bPatient && patientSearchB.total === 1, "Praxis B sieht die eigene Patientenakte nicht korrekt.");

      const foreignLoad = await bPage.evaluate(async (id) => {
        const mod = await import("/src/lib/practice/desk-actions.ts");
        return mod.loadPatientById({ data: { id } });
      }, ids.aPatient);
      assert(foreignLoad?.ok === false && !foreignLoad.patient, "Praxis B kann die Detailakte von Praxis A laden.");

      const ownUpdate = await bPage.evaluate(async (id) => {
        const mod = await import("/src/lib/practice/desk-actions.ts");
        return mod.updatePatientContact({ data: {
          id, owner: "Audit Halter B", phone: "+43660123452", email: "audit-b@example.test",
          species: "Hund", chip: "", notes: "Nur Praxis B: kontrollierte Änderung.",
        } });
      }, ids.bPatient);
      assert(ownUpdate?.ok === true, "Praxis B konnte die eigene Patientenakte nicht kontrolliert ändern.");
      const updateRequest = bPosts.find((item) => item.body.includes(ids.bPatient) && item.body.includes("kontrollierte Änderung"));
      assert(updateRequest, "Kein beobachteter Patienten-UPDATE-POST für die kontrollierte B-Änderung.");
      const foreignUpdate = await replayFromPage(bPage, updateRequest, replacePayload(updateRequest.body, ids.bPatient, ids.aPatient));
      assert(foreignUpdate.status >= 200 && foreignUpdate.status < 500, "Fremder Patienten-UPDATE-POST konnte nicht kontrolliert ausgeführt werden.");
      const foreignUpdateDecoded = decodeReplay(foreignUpdate);
      assert(foreignUpdateDecoded?.result?.ok === false, "Fremder Patienten-UPDATE-POST wurde nicht als Ablehnung zurückgegeben.");
      const cookieFree = await replayWithoutCookies(bPage, updateRequest, updateRequest.body);
      assert((cookieFree.status === 401 || cookieFree.status === 403) || (cookieFree.status === 200 && cookieFree.text.includes("Unauthorized")), "Cookie-freier gültiger Patienten-UPDATE-POST wurde nicht abgelehnt.");
      console.log("[isolation] patient search/load/update A/B and cookie-free replay checked");
    }
    if (process.env.APPOINTMENT_ISOLATION_AUDIT === "1") {
      const foreignStatus = await bPage.evaluate(async (id) => {
        const mod = await import("/src/lib/practice/desk-actions.ts");
        return mod.updateAppointmentStatus({ data: { id, status: "bestätigt" } });
      }, ids.aAppointment);
      assert(foreignStatus?.ok === false && foreignStatus.error === "Termin nicht gefunden.", "Praxis B kann den Terminstatus von Praxis A ändern.");
      const ownStatus = await bPage.evaluate(async (id) => {
        const mod = await import("/src/lib/practice/desk-actions.ts");
        return mod.updateAppointmentStatus({ data: { id, status: "bestätigt" } });
      }, ids.bAppointment);
      assert(ownStatus?.ok === true && ownStatus.status === "bestätigt", "Praxis B konnte den eigenen Terminstatus nicht ändern.");
      const foreignReschedule = await bPage.evaluate(async (id) => {
        const mod = await import("/src/lib/practice/desk-actions.ts");
        return mod.rescheduleAppointment({ data: { id, start: "2099-01-05T09:30:00Z" } });
      }, ids.aAppointment);
      assert(foreignReschedule?.ok === false && foreignReschedule.error === "Termin nicht gefunden.", "Praxis B kann den Termin von Praxis A verschieben.");
      const ownReschedule = await bPage.evaluate(async (id) => {
        const mod = await import("/src/lib/practice/desk-actions.ts");
        return mod.rescheduleAppointment({ data: { id, start: "2099-01-05T09:30:00Z" } });
      }, ids.bAppointment);
      assert(ownReschedule?.ok === true && ownReschedule.start, "Praxis B konnte den eigenen Termin nicht verschieben.");
      console.log("[isolation] appointment status/reschedule A/B checked");
    }
    await bPage.goto(`${baseUrl}/app/einstellungen`, { waitUntil: "domcontentloaded" });
    await bPage.locator("#new-fact").waitFor();
    // As with login, wait for the lazily compiled client route to attach the
    // real button handler; merely seeing SSR markup is not enough.
    await bPage.waitForTimeout(8_000);
    const bText = await bPage.locator("body").innerText();
    assert(!bText.includes("Nur Praxis A: vertrauliche Regel."), "Praxis B kann den Hinweis von Praxis A lesen.");
    assert(bText.includes("Nur Praxis B: vertrauliche Regel."), "Praxis B sieht ihren eigenen Hinweis nicht.");

    if (auditReplaceRetry) {
      const retrySourceText = "Audit Retry Quelle: vertrauliche Ausgangsregel.";
      const retryTargetText = "Audit Retry Ziel: bereits vorhandene Regel.";
      const retryFacts = await bPage.evaluate(async ({ source, target }) => {
        const mod = await import("/src/lib/practice/facts.ts");
        return {
          source: await mod.rememberPracticeFact({ data: { fact: source } }),
          target: await mod.rememberPracticeFact({ data: { fact: target } }),
        };
      }, { source: retrySourceText, target: retryTargetText });
      assert(retryFacts.source?.ok && retryFacts.source.id, "Retry-Test konnte die synthetische Quelle nicht über rememberPracticeFact anlegen.");
      assert(retryFacts.target?.ok && retryFacts.target.id, "Retry-Test konnte das synthetische Ziel nicht über rememberPracticeFact anlegen.");
      assert(retryFacts.source.id !== retryFacts.target.id, "Retry-Test hat für Quelle und Ziel dieselbe Fakten-ID erhalten.");
      retryAuditIds = { source: retryFacts.source.id, target: retryFacts.target.id };

      const normalText = "Audit Retry Quelle: normalisierte Regel.";
      const normalResults = await bPage.evaluate(async ({ id, expectedFact, fact }) => {
        const mod = await import("/src/lib/practice/facts.ts");
        const first = await mod.replacePracticeFact({ data: { id, fact, expectedFact } });
        const second = await mod.replacePracticeFact({ data: { id, fact, expectedFact } });
        return { first, second };
      }, { id: retryFacts.source.id, expectedFact: retrySourceText, fact: normalText });
      assert(normalResults.first?.ok && normalResults.first.id === retryFacts.source.id && normalResults.first.duplicate === false, "Erste normale Ersetzung meldete keinen Erfolg mit der Quell-ID.");
      assert(JSON.stringify(normalResults.second) === JSON.stringify(normalResults.first), "Normale Ersetzung ist beim Retry nicht idempotent.");

      const staleReplace = await bPage.evaluate(async ({ id, expectedFact }) => {
        const mod = await import("/src/lib/practice/facts.ts");
        return mod.replacePracticeFact({
          data: {
            id,
            fact: "Audit veraltete Korrektur darf nicht gespeichert werden.",
            expectedFact,
          },
        });
      }, { id: retryFacts.source.id, expectedFact: retrySourceText });
      assert(staleReplace.ok === false, "Stale Replace mit veralteter expectedFact wurde fälschlich akzeptiert.");

      const staleForget = await bPage.evaluate(async ({ id, expectedFact }) => {
        const mod = await import("/src/lib/practice/facts.ts");
        return mod.forgetPracticeFact({ data: { id, expectedFact } });
      }, { id: retryFacts.source.id, expectedFact: retrySourceText });
      assert(staleForget.ok === false, "Vergessensversuch mit veralteter expectedFact wurde fälschlich akzeptiert.");

      const retryFactsAfterUpdate = await bPage.evaluate(async () => {
        const mod = await import("/src/lib/practice/facts.ts");
        return mod.loadPracticeFacts();
      }, {});
      assert(retryFactsAfterUpdate?.ok && Array.isArray(retryFactsAfterUpdate.facts), "Praxisfakten konnten für Retry-Prüfung nicht geladen werden.");
      assert(retryFactsAfterUpdate.facts.some((row) => row.id === retryFacts.source.id && row.fact === normalText), "Retry-Quelle enthält nach der Normalisierung nicht mehr den erwarteten Normaltext.");
      assert(retryFactsAfterUpdate.facts.some((row) => row.id === retryFacts.target.id && row.fact === retryTargetText), "Retry-Ziel wurde durch den Merge nicht korrekt auf Zieltext gehalten.");

      const mergeResults = await bPage.evaluate(async ({ id, expectedFact, fact }) => {
        const mod = await import("/src/lib/practice/facts.ts");
        const first = await mod.replacePracticeFact({ data: { id, fact, expectedFact } });
        const second = await mod.replacePracticeFact({ data: { id, fact, expectedFact } });
        return { first, second };
      }, { id: retryFacts.source.id, expectedFact: normalText, fact: retryTargetText });
      console.log(JSON.stringify({ replaceRetryMergeObserved: mergeResults }));
      assert(mergeResults.first?.ok && mergeResults.first.id === retryFacts.source.id && mergeResults.first.fact === retryTargetText, "Erster Merge meldete nicht die erhaltene Quell-ID mit dem Zieltext.");
      assert(mergeResults.second?.ok && mergeResults.second.id === mergeResults.first.id && mergeResults.second.fact === mergeResults.first.fact, "Retry muss dasselbe erfolgreiche Merge-Ergebnis liefern; erhalten: " + JSON.stringify(mergeResults.second));
      console.log(JSON.stringify({ replaceRetry: { sourceId: retryFacts.source.id, targetId: retryFacts.target.id, normal: normalResults, merge: mergeResults } }));
    }

    const ownFact = "Praxis B darf diese neue Regel selbst speichern.";
    await bPage.locator("#new-fact").fill(ownFact);
    let failedOwnRemember = false;
    const failOwnRememberRoute = async (route) => {
      const request = route.request();
      if (request.method() === "POST" && !failedOwnRemember && (request.postData() || "").includes(ownFact)) {
        failedOwnRemember = true;
        if (auditAfterCommit) {
          const response = await route.fetch({ timeout: 15_000, maxRedirects: 0 });
          const decoded = await deserializeServerFnResponse(response);
          afterCommitObserved = response.ok() && decoded?.result?.ok === true;
          firstCommittedFactId = decoded?.result?.id ?? null;
          assert(afterCommitObserved && firstCommittedFactId, "Der echte erste Fakten-POST meldete keinen erfolgreichen Commit mit ID.");
          return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "controlled post-commit audit failure" }) });
        }
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "controlled audit failure" }) });
      }
      return route.fallback();
    };
    await b.route("**/_serverFn/**", failOwnRememberRoute);
    const rememberPost = bPage.waitForRequest((request) => request.method() === "POST" && (request.postData() || "").includes(ownFact), { timeout: 15_000 });
    await bPage.locator("#settings-fact-merken").click();
    await rememberPost;
    await bPage.getByText("Hinweis nicht gespeichert.").waitFor({ timeout: 15_000 });
    assert((await bPage.locator("#new-fact").inputValue()) === ownFact, "Fehlgeschlagener Speicherversuch muss den Eingabetext behalten.");
    await b.unroute("**/_serverFn/**", failOwnRememberRoute);
    await bPage.waitForFunction(() => {
      const button = document.querySelector("#settings-fact-merken");
      return button instanceof HTMLButtonElement && !button.disabled;
    });
    const retryPost = bPage.waitForRequest((request) => request.method() === "POST" && (request.postData() || "").includes(ownFact), { timeout: 15_000 });
    await bPage.locator("#settings-fact-merken").click();
    await retryPost;
    await bPage.locator("body").getByText(/(?:Gemerkt\. Gilt beim nächsten Anruf\.|Hatte ich schon\.)/).waitFor({ timeout: 15_000 });
    assert(failedOwnRemember, "Der kontrollierte eigene Save-Fehler wurde nicht ausgelöst.");
    assert((await bPage.locator("#new-fact").inputValue()) === "", "Erfolgreicher Retry muss den Eingabetext leeren.");
    assert(bPosts.filter((item) => item.body.includes(ownFact)).length === 2, "Eigener Save muss genau einmal fehlschlagen und einmal erfolgreich wiederholt werden.");
    if (auditAfterCommit) assert(afterCommitObserved && firstCommittedFactId, "Der erste Fakten-POST wurde nicht echt erfolgreich gespeichert.");
    const remember = factRequest(bPosts, ownFact);
    const foreignRemember = await replayFromPage(bPage, remember, replacePayload(remember.body, "Praxis B darf diese neue Regel selbst speichern.", "Praxis A darf niemals per fremder Sitzung gespeichert werden."));
    assert(foreignRemember.status >= 200 && foreignRemember.status < 500, "Fremder Remember-POST konnte nicht kontrolliert ausgeführt werden.");
    console.log("[isolation] remember replay checked");

    // replacePracticeFact has no standalone settings button; call its Vite client proxy,
    // then use the exact POST observed from that real server function.
    await bPage.evaluate(async ({ expectedFact }) => {
      const mod = await import("/src/lib/practice/facts.ts");
      await mod.replacePracticeFact({ data: { id: "audit-fact-b", fact: "Praxis B ersetzt nur ihren eigenen Hinweis.", expectedFact } });
    }, { expectedFact: "Nur Praxis B: vertrauliche Regel." });
    const replacement = factRequest(bPosts, "Praxis B ersetzt nur ihren eigenen Hinweis.");
    const foreignReplace = await replayFromPage(bPage, replacement, replacePayload(replacement.body, ids.bFact, ids.aFact));
    assert(foreignReplace.status >= 200 && foreignReplace.status < 500, "Fremder Replace-POST konnte nicht kontrolliert ausgeführt werden.");
    console.log("[isolation] replace replay checked");

    await bPage.reload();
    await waitForOwnUpdatedText(bPage, "Praxis B ersetzt nur ihren eigenen Hinweis.");

    const deleteButton = bPage.locator("#settings-fact-delete-audit-fact-b");
    // SSR can show the button before React attaches its click handler.
    await bPage.waitForFunction(() => {
      const button = document.querySelector("#settings-fact-delete-audit-fact-b");
      return button && Object.keys(button).some((key) =>
        key.startsWith("__reactProps$") && typeof button[key]?.onClick === "function",
      );
    }, undefined, { timeout: 15_000 });
    const [deletePost] = await Promise.all([
      bPage.waitForRequest((request) => request.method() === "POST" && (request.postData() || "").includes(ids.bFact), { timeout: 15_000 }),
      deleteButton.click(),
    ]);
    await bPage.getByText("Praxis B ersetzt nur ihren eigenen Hinweis.").waitFor({ state: "detached" });
    const deletion = observedRequest(deletePost);
    assert(deletion.url !== replacement.url, "Delete-POST ist nicht vom Replace-POST getrennt beobachtet.");
    assert(deletion.body.includes(ids.bFact), "Beobachteter Delete-POST enthält keine Fakten-ID.");
    const foreignDelete = await replayFromPage(bPage, deletion, replacePayload(deletion.body, ids.bFact, ids.aFact));
    assert(foreignDelete.status >= 200 && foreignDelete.status < 500, "Fremder Delete-POST konnte nicht kontrolliert ausgeführt werden.");
    console.log("[isolation] delete replay checked");

  } finally {
    await browser.close();
  }
  await stopServer();
  console.log("[isolation] isolated server stopped");
  const facts = await countFacts(dataDir);
  const aFact = facts.find((row) => row.id === ids.aFact);
  const bFact = facts.find((row) => row.id === ids.bFact);
  assert(aFact?.practice_id === ids.aPractice && aFact.fact === "Nur Praxis A: vertrauliche Regel.", "Praxis A wurde durch eine fremde Sitzung verändert.");
  assert(!bFact, "Praxis B konnte ihren eigenen Hinweis nicht löschen.");
  const ownFactRows = facts.filter((row) => row.practice_id === ids.bPractice && row.fact === "Praxis B darf diese neue Regel selbst speichern.");
  assert(ownFactRows.length === 1, "Eigene Anlegen-und-Retry-Operation muss genau eine Faktenzeile hinterlassen.");
  if (auditAfterCommit) assert(ownFactRows[0].id === firstCommittedFactId, "Retry darf keine neue Fakten-ID erzeugen; es muss dieselbe gespeicherte ID bleiben.");
  assert(!facts.some((row) => row.practice_id === ids.aPractice && row.fact.includes("fremder Sitzung")), "Fremder Remember-POST schrieb in Praxis A.");
  if (auditReplaceRetry) {
    assert(retryAuditIds, "Retry-Testdaten fehlen trotz aktiviertem Retry-Audit.");
    const retrySource = facts.find((row) => row.id === retryAuditIds.source);
    const retryTarget = facts.find((row) => row.id === retryAuditIds.target);
    assert(retrySource?.practice_id === ids.bPractice && retrySource.fact === "Audit Retry Ziel: bereits vorhandene Regel.", "Merge muss die Quell-ID mit dem Zieltext erhalten.");
    assert(!retryTarget, "Merge muss die vorhandene Zielzeile entfernen.");
  }
  if (process.env.PATIENT_ISOLATION_AUDIT === "1") {
    const patients = await patientRows(dataDir);
    const aPatient = patients.find((row) => row.id === ids.aPatient);
    const bPatient = patients.find((row) => row.id === ids.bPatient);
    const beforeA = patientSnapshotBefore.find((row) => row.id === ids.aPatient);
    const beforeB = patientSnapshotBefore.find((row) => row.id === ids.bPatient);
    assert(patients.length === patientSnapshotBefore.length, "Unerwartete Patienten angelegt oder entfernt.");
    assert(JSON.stringify(aPatient) === JSON.stringify(beforeA), "Praxis A wurde durch eine fremde Patienten-Sitzung verändert.");
    assert(JSON.stringify(bPatient) === JSON.stringify({ ...beforeB, notes: "Nur Praxis B: kontrollierte Änderung." }), "Praxis B enthält unerwartete weitere Änderungen.");
    assert(bPatient?.practice_id === ids.bPractice && bPatient.name === "Audit Patient B" && bPatient.species === "Hund" && bPatient.owner_name === "Audit Halter B" && bPatient.phone.endsWith("52") && bPatient.email === "audit-b@example.test" && bPatient.notes === "Nur Praxis B: kontrollierte Änderung.", "Die legitime Patientenänderung von Praxis B fehlt oder wurde falsch gespeichert.");
  }
  if (process.env.APPOINTMENT_ISOLATION_AUDIT === "1") {
    const appointments = await appointmentRows(dataDir);
    const beforeA = appointmentSnapshotBefore.find((row) => row.id === ids.aAppointment);
    const afterA = appointments.find((row) => row.id === ids.aAppointment);
    const afterB = appointments.find((row) => row.id === ids.bAppointment);
    const beforeB = appointmentSnapshotBefore.find((row) => row.id === ids.bAppointment);
    assert(JSON.stringify(afterA) === JSON.stringify(beforeA), "Praxis A wurde durch eine fremde Terminsitzung verändert.");
    const { start_at: _beforeStart, status: _beforeStatus, ...beforeBStable } = beforeB ?? {};
    const { start_at: afterStart, status: afterStatus, ...afterBStable } = afterB ?? {};
    assert(JSON.stringify(afterBStable) === JSON.stringify(beforeBStable) && new Date(afterStart).toISOString() === "2099-01-05T09:30:00.000Z" && afterStatus === "gelegt", "Praxis B enthält unerwartete Terminänderungen.");
    assert(appointments.length === 2, "Die Termin-Isolationsprobe hat die Anzahl der Terminzeilen verändert.");
    assert(afterB?.practice_id === ids.bPractice && new Date(afterB.start_at).toISOString() === "2099-01-05T09:30:00.000Z" && afterB.minutes === 20 && afterB.owner_name === "Audit Halter B" && afterB.pet === "Audit Tier B" && afterB.kind === "Kontrolle" && afterB.vet === "" && afterB.channel === "telefon" && afterB.status === "gelegt", "Die legitimen Änderungen von Praxis B sind nicht korrekt gespeichert.");
  }
  if (process.env.PROTOCOL_ISOLATION_AUDIT === "1") {
    const protocol = await protocolRows(dataDir);
    assert(protocol.calls.length === protocolSnapshotBefore.calls.length && protocol.threads.length === protocolSnapshotBefore.threads.length && protocol.mails.length === protocolSnapshotBefore.mails.length, "Protokoll-Isolationsprobe veränderte die Zeilenanzahl.");
    const beforeA = protocolSnapshotBefore.calls.find((row) => row.id === ids.aCall);
    const afterA = protocol.calls.find((row) => row.id === ids.aCall);
    const beforeB = protocolSnapshotBefore.calls.find((row) => row.id === ids.bCall);
    const afterB = protocol.calls.find((row) => row.id === ids.bCall);
    assert(JSON.stringify(afterA) === JSON.stringify(beforeA), "Praxis A wurde durch fremden Anrufstatus verändert.");
    assert(afterB?.status === "erledigt" && JSON.stringify({ ...afterB, status: beforeB.status }) === JSON.stringify(beforeB), "Praxis B enthält unerwartete Anrufänderungen.");
    const beforeThreadA = protocolSnapshotBefore.threads.find((row) => row.id === ids.aThread);
    const afterThreadA = protocol.threads.find((row) => row.id === ids.aThread);
    const beforeThreadB = protocolSnapshotBefore.threads.find((row) => row.id === ids.bThread);
    const afterThreadB = protocol.threads.find((row) => row.id === ids.bThread);
    assert(JSON.stringify(afterThreadA) === JSON.stringify(beforeThreadA), "Fremdes Gelesen-Markieren veränderte Praxis A.");
    assert(afterThreadB?.unread === 0 && JSON.stringify({ ...afterThreadB, unread: beforeThreadB.unread }) === JSON.stringify(beforeThreadB), "Eigenes Gelesen-Markieren veränderte unerwartete Threadfelder.");
    assert(JSON.stringify(protocol.mails) === JSON.stringify(protocolSnapshotBefore.mails), "Mail-Protokoll wurde unerwartet verändert.");
    assert(JSON.stringify(protocol.patients) === JSON.stringify(protocolSnapshotBefore.patients), "Patienten-Gesamtbestand wurde durch Protokollzugriff verändert.");
  }
  console.log(JSON.stringify({ ok: true, port, mode: auditAfterCommit ? "after-commit" : "standard", afterCommitObserved, checks: ["B liest A nicht", "B legt eigenen Hinweis an und wiederholt ohne Doppelzeile", "A bleibt nach fremdem Remember/Delete/Replace unverändert", ...(process.env.PROTOCOL_ISOLATION_AUDIT === "1" ? ["Protokoll search/load/status/read A/B, Kontakte und cookie-freie sieben Serverfunktionen geprüft"] : [])] }, null, 2));
}

main().catch(async (error) => {
  keepTemp = true;
  const failure = { ok: false, error: error instanceof Error ? error.message : String(error), tempDir, serverLog: serverLog.join("").slice(-3000) };
  await stopServer();
  if (dataDir) {
    try {
      console.error(JSON.stringify({ ...failure, finalFacts: await countFacts(dataDir) }, null, 2));
    } catch (readError) {
      console.error(JSON.stringify({ ...failure, finalFactsError: readError instanceof Error ? readError.message : String(readError) }, null, 2));
    }
  } else {
    console.error(JSON.stringify(failure, null, 2));
  }
  process.exitCode = 1;
}).finally(async () => {
  await stopServer();
  if (tempDir && !keepTemp) {
    const resolvedTemp = await realpath(tempDir);
    assert(dirname(resolvedTemp).toLowerCase() === (await realpath(tmpdir())).toLowerCase()
      && basename(resolvedTemp).startsWith("silvia-isolation-audit-"), "Unsicheres Bereinigungsziel");
    await rm(resolvedTemp, { recursive: true, force: true });
  }
  if (keepTemp && tempDir) console.error(`Temporäre Fehlerdaten bleiben zur Prüfung erhalten: ${tempDir}`);
});
