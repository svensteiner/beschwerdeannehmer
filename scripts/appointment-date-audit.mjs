#!/usr/bin/env node
/* Isolated, authenticated proof that a requested day reaches the board. */
import { randomBytes, scryptSync } from "node:crypto";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { chromium } from "playwright";

const uiMode = process.argv.includes("--ui");
const sourceArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!sourceArg) throw new Error("Usage: node scripts/appointment-date-audit.mjs <isolated-temp-root>");
const source = await realpath(sourceArg);
const systemTemp = await realpath(tmpdir());
if (!source.startsWith(`${systemTemp}${process.platform === "win32" ? "\\" : "/"}`)) {
  throw new Error(`Refuse source outside temporary directory: ${source}`);
}
if ((await realpath(join(source, "package.json"))).length === 0) throw new Error("missing package.json");
const port = 8096;
const base = `http://127.0.0.1:${port}`;
const password = "Audit-Date-2026!";
const ids = { ap: "date-a", bp: "date-b", au: "date-user-a", bu: "date-user-b", at: "date-patient-a", bt: "date-patient-b" };
let server;
let dbDir;
let uiAssistantTexts = [];

const hashPassword = (value) => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$16384$8$1$${salt}$${scryptSync(value, salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex")}`;
};
const freePort = (p) => new Promise((resolve) => {
  const s = createServer(); s.once("error", () => resolve(false));
  s.once("listening", () => s.close(() => resolve(true))); s.listen(p, "127.0.0.1");
});
const migrations = (await readdir(join(source, "migrations"))).filter((name) => name.endsWith(".sql")).sort();

async function seed() {
  dbDir = await mkdtemp(join(systemTemp, "silvia-appointment-db-"));
  const db = new PGlite({ dataDir: dbDir }); await db.waitReady;
  await db.exec("create table _migrations (name text primary key, applied_at timestamptz not null default now())");
  for (const name of migrations) { await db.exec(await readFile(join(source, "migrations", name), "utf8")); await db.query("insert into _migrations (name) values ($1)", [name]); }
  for (const side of ["a", "b"]) {
    const practice = ids[`${side}p`], user = ids[`${side}u`], patient = ids[`${side}t`];
    await db.query("insert into practices (id,name,owner_name,email) values ($1,$2,$3,$4)", [practice, `Date Audit ${side}`, `Audit Owner ${side}`, `date-${side}@example.test`]);
    await db.query("insert into practice_users (id,practice_id,email,password_hash,name,role) values ($1,$2,$3,$4,$5,'inhaberin')", [user, practice, `date-${side}@example.test`, hashPassword(password), `Audit ${side}`]);
    await db.query("insert into patients (id,practice_id,name,species,owner_name,phone,email,source) values ($1,$2,$3,'Hund',$4,$5,$6,'audit')", [patient, practice, "Audit Hund", `Audit Owner ${side}`, `+4366012345${side === "a" ? "1" : "2"}`, `owner-${side}@example.test`]);
    const open = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"].map((day) => ({ day, time: "08:00–12:00" }));
    const closed = open.map(({ day }) => ({ day, time: "geschlossen · Nachtdienst" }));
    const hours = JSON.stringify(side === "a" ? open : closed);
    await db.query("update practices set hours_json=$1 where id=$2", [hours, practice]);
  }
  const before = await db.query("select id,practice_id,start_at,owner_name,pet,kind,vet,channel,status from appointments order by id");
  const patients = await db.query("select id,practice_id,name,species,owner_name,phone,email,notes,source from patients order by id");
  await db.close(); return { appointments: before.rows, patients: patients.rows };
}

function childEnv(data) {
  const path = join(source, "node_modules", ".bin");
  return { PATH: `${path};${process.env.PATH ?? ""}`, SystemRoot: process.env.SystemRoot ?? "C:\\Windows", ComSpec: process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe", TEMP: process.env.TEMP ?? systemTemp, TMP: process.env.TMP ?? systemTemp, USERPROFILE: process.env.USERPROFILE ?? systemTemp, VITE_AUTH_ENABLED: "false", SILVIA_DATA_DIR: data, DATABASE_URL: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", SILVIA_LLM_BASE_URL: "", SILVIA_LIVE_DEMO_ENABLED: "0", HTTP_PROXY: "", HTTPS_PROXY: "", ALL_PROXY: "", http_proxy: "", https_proxy: "", all_proxy: "", NODE_USE_ENV_PROXY: "0" };
}
async function waitReady() {
  const until = Date.now() + 45_000;
  while (Date.now() < until) { if (server.exitCode !== null) throw new Error(`server exited ${server.exitCode}`); try { if ((await fetch(`${base}/login`)).ok) return; } catch { /* Dienst noch nicht bereit. */ } await new Promise((r) => setTimeout(r, 250)); }
  throw new Error("server timeout");
}
function stopServer() {
  if (!server || (server.exitCode !== null || server.signalCode !== null)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer;
    let killTimer;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      server.removeListener("close", onClose);
      server.removeListener("exit", onClose);
      server.removeListener("error", onError);
      if (error) reject(error); else resolve();
    };
    const onClose = () => finish();
    const onError = (error) => finish(error);
    server.once("close", onClose);
    server.once("exit", onClose);
    server.once("error", onError);
    timer = setTimeout(() => {
      if (server.exitCode !== null || server.signalCode !== null) return finish();
      server.kill("SIGKILL");
      killTimer = setTimeout(() => finish(new Error("isolated server did not exit after SIGKILL")), 5_000);
    }, 10_000);
    server.kill("SIGTERM");
  });
}
async function removeDbSafely() {
  if (!dbDir) return;
  const resolved = await realpath(dbDir);
  if (dirname(resolved) !== systemTemp || !basename(resolved).startsWith("silvia-appointment-db-")) {
    throw new Error(`refuse database cleanup outside owned temp directory: ${resolved}`);
  }
  await rm(resolved, { recursive: true, force: true });
}
async function login(page, side) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(8000);
  await page.locator("#email").fill(`date-${side}@example.test`); await page.locator("#password").fill(password);
  await page.locator("#desk-login-submit").click();
  await page.waitForURL(/\/app/);
}
async function callFlow(page, side, text) {
  return page.evaluate(async ({ side, text }) => {
    const { askAlma } = await import("/src/lib/alma/ask-alma.ts");
    const { persistBoardEvent } = await import("/src/lib/practice/board.ts");
    const messages = [
      { role: "user", content: `Ich bin Audit Owner ${side}, meine Handynummer ist 066012345${side === "a" ? "1" : "2"}.` },
      { role: "user", content: text },
    ];
    const proposal = await askAlma({ data: { messages, edition: "standard", demo: false, train: false } });
    const confirmedMessages = [...messages, { role: "assistant", content: proposal.text }, { role: "user", content: "Ja, passt." }];
    const answer = await askAlma({ data: { messages: confirmedMessages, edition: "standard", demo: false, train: false } });
    const saved = await persistBoardEvent({ data: { user: confirmedMessages.at(-1).content, reply: answer.text, action: answer.action, lines: confirmedMessages, firstTurn: true, channel: "web" } });
    const correctionMessages = [...confirmedMessages, { role: "assistant", content: answer.text }, { role: "user", content: "Bitte um 11:00 Uhr." }];
    const correction = saved?.confirm?.id
      ? await askAlma({ data: { messages: correctionMessages, edition: "standard", demo: false, train: false, confirmId: saved.confirm.id } })
      : null;
    const correctionSaved = correction
      ? await persistBoardEvent({ data: { user: correctionMessages.at(-1).content, reply: correction.text, action: correction.action, lines: correctionMessages, firstTurn: false, channel: "web", confirmId: saved.confirm?.id ?? "" } })
      : null;
    const hoursMessages = [...correctionMessages, { role: "assistant", content: correction?.text ?? "" }, { role: "user", content: "Wie sind morgen eure Öffnungszeiten?" }];
    const hours = saved?.confirm?.id
      ? await askAlma({ data: { messages: hoursMessages, edition: "standard", demo: false, train: false, confirmId: saved.confirm.id } })
      : null;
    return { proposal, answer, saved, correction, correctionSaved, hours };
  }, { side, text });
}
async function restartReadExistingAppointment(confirmId) {
  await stopServer();
  server = spawn(process.execPath, [join(source, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port)], { cwd: source, env: childEnv(dbDir), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  server.stdout.on("data", (b) => process.stdout.write(`[server-restart] ${b}`)); server.stderr.on("data", (b) => process.stderr.write(`[server-restart] ${b}`));
  await waitReady();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, "a");
    const result = await page.evaluate(async ({ confirmId }) => {
      const { askAlma } = await import("/src/lib/alma/ask-alma.ts");
      return askAlma({ data: { messages: [{ role: "user", content: "Bitte um 11:00 Uhr." }], edition: "standard", demo: false, train: false, confirmId } });
    }, { confirmId });
    if (result.action.type !== "none" || !/^Der bestehende Termin für Audit Hund bleibt am /i.test(result.text)) {
      throw new Error(`restart did not safely read existing appointment: ${JSON.stringify(result)}`);
    }
    console.log(JSON.stringify({ restartRead: { confirmId, action: result.action, responseText: result.text } }));
  } finally {
    await stopServer();
    await browser.close();
  }
}
async function specificTimeRequest(page, side) {
  return page.evaluate(async ({ side }) => {
    const { askAlma } = await import("/src/lib/alma/ask-alma.ts");
    const { persistBoardEvent } = await import("/src/lib/practice/board.ts");
    const messages = [
      { role: "user", content: `Ich bin Audit Owner ${side}, meine Handynummer ist 066012345${side === "a" ? "1" : "2"}.` },
      { role: "user", content: "Ich brauche morgen um 10:30 Uhr einen Termin für Audit Hund." },
    ];
    const answer = await askAlma({ data: { messages, edition: "standard", demo: false, train: false } });
    const saved = await persistBoardEvent({ data: { user: messages.at(-1).content, reply: answer.text, action: answer.action, lines: messages, firstTurn: true, channel: "web" } });
    return { answer, saved };
  }, { side });
}
async function concurrentSlotBooking(page) {
  return page.evaluate(async () => {
    const { askAlma } = await import("/src/lib/alma/ask-alma.ts");
    const { persistBoardEvent, APPOINTMENT_SLOT_CONFLICT_REPLY } = await import("/src/lib/practice/board.ts");
    const messages = [
      { role: "user", content: "Ich bin Audit Owner a, meine Handynummer ist 0660123451." },
      { role: "user", content: "Ich brauche übermorgen einen Termin für Audit Hund." },
    ];
    const answer = await askAlma({ data: { messages, edition: "standard", demo: false, train: false } });
    if (answer.action.type !== "book") return { answer, attempts: [] };
    // Ein fester, rein synthetischer Connector-Slot zwingt beide Anfragen auf
    // denselben Zeitstempel; es wird dabei kein Connector aufgerufen.
    const action = {
      ...answer.action,
      connectorStart: `${answer.action.preferredDate}T07:00:00.000Z`,
      connectorApplied: true,
    };
    const payload = { user: messages.at(-1).content, reply: answer.text, action, lines: messages, firstTurn: true, channel: "web" };
    const attempts = await Promise.all([
      persistBoardEvent({ data: payload }),
      persistBoardEvent({ data: payload }),
    ]);
    return { answer: { ...answer, action }, attempts, conflictReply: APPOINTMENT_SLOT_CONFLICT_REPLY };
  });
}
async function uiFlow(page) {
  await login(page, "a");
  await page.goto(`${base}/sprechen`, { waitUntil: "commit" });
  await page.waitForTimeout(8000);
  await page.locator("#sprechen-anrufen").click();
  try {
    await page.getByText("Verbunden", { exact: true }).waitFor({ timeout: 30_000 });
  } catch (error) {
    throw new Error(`UI call did not reach live phase: url=${page.url()} body=${(await page.locator("body").innerText()).slice(0, 500)}; ${error instanceof Error ? error.message : String(error)}`);
  }
  const input = page.locator('form input').first();
  const assistant = page.locator('[data-line-role="assistant"]');
  async function send(text) {
    const before = await assistant.count();
    await input.fill(text);
    await input.press("Enter");
    await page.waitForFunction((oldCount) => document.querySelectorAll('[data-line-role="assistant"]').length > oldCount, before, { timeout: 30_000 });
  }
  await send("Ich bin Audit Owner a, meine Handynummer ist 0660123451.");
  await send("Ich brauche morgen einen Termin für Audit Hund.");
  await send("Ja, passt.");
  await send("Morgen statt heute.");
  await send("Wie sind morgen eure Öffnungszeiten?");
  await send("Meine neue Handynummer ist 0660999999.");
  await send("Ja, passt.");
  await send("Meine neue E-Mail ist neu@example.test.");
  await send("Ja, passt.");
  const targets = {};
  for (const id of ["sprechen-sms-bestaetigung", "sprechen-wa-bestaetigung", "sprechen-mail-bestaetigung"]) {
    targets[id] = await page.locator(`#${id}`).getAttribute("href");
  }
  const assistantTexts = await assistant.allTextContents();
  const userTexts = await page.locator('[data-line-role="user"]').allTextContents();
  await page.reload({ waitUntil: "domcontentloaded" });
  const targetsAfterReload = {};
  for (const id of ["sprechen-sms-bestaetigung", "sprechen-wa-bestaetigung", "sprechen-mail-bestaetigung"]) {
    targetsAfterReload[id] = await page.locator(`#${id}`).getAttribute("href");
  }
  return { assistantTexts, userTexts, targets, targetsAfterReload };
}

try {
  if (!(await freePort(port))) throw new Error(`port ${port} is occupied`);
  const before = await seed();
  server = spawn(process.execPath, [join(source, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port)], { cwd: source, env: childEnv(dbDir), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  server.stdout.on("data", (b) => process.stdout.write(`[server] ${b}`)); server.stderr.on("data", (b) => process.stderr.write(`[server] ${b}`));
  await waitReady();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("synthetic audit microphone disabled", "NotAllowedError"); };
    });
    await context.route("**/*", (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const a = await context.newPage();
    if (uiMode) {
      const uiResult = await uiFlow(a);
      uiAssistantTexts = uiResult.assistantTexts;
      if (uiResult.assistantTexts.some((text) => /Akte von Handynummer|Telefonnummer als Akte|Patientenkarte.*Nummer/i.test(text))) {
        throw new Error(`UI exposed an invalid patient identity: ${JSON.stringify(uiResult.assistantTexts)}`);
      }
      if (!/^Der Termin für Audit Hund bleibt am /i.test(uiResult.assistantTexts[3] ?? "")) {
        throw new Error(`UI confirmation turn did not preserve the stored appointment: ${JSON.stringify(uiResult.assistantTexts)}`);
      }
      if (!/^Der bestehende Termin für Audit Hund bleibt am /i.test(uiResult.assistantTexts[4] ?? "")) {
        throw new Error(`UI correction turn was not the expected non-booking response: ${JSON.stringify(uiResult.assistantTexts)}`);
      }
      if (!/^Unsere Zeiten:/i.test(uiResult.assistantTexts[5] ?? "")) {
        throw new Error(`UI did not answer the opening-hours follow-up: ${JSON.stringify(uiResult.assistantTexts)}`);
      }
      if (!/Handynummer erhalten/i.test(uiResult.assistantTexts[6] ?? "")) {
        throw new Error(`UI did not acknowledge the changed phone number: ${JSON.stringify(uiResult.assistantTexts)}`);
      }
      if (!/^Der Termin für Audit Hund bleibt am /i.test(uiResult.assistantTexts[7] ?? "")) {
        throw new Error(`UI re-confirmation did not preserve the existing appointment: ${JSON.stringify(uiResult.assistantTexts)}`);
      }
      if (!/E-Mail-Adresse erhalten/i.test(uiResult.assistantTexts[8] ?? "")) {
        throw new Error(`UI did not acknowledge the changed email: ${JSON.stringify(uiResult.assistantTexts)}`);
      }
      if (!/^Der Termin für Audit Hund bleibt am /i.test(uiResult.assistantTexts[9] ?? "")) {
        throw new Error(`UI email re-confirmation did not preserve the existing appointment: ${JSON.stringify(uiResult.assistantTexts)}`);
      }
      const expectedTargets = {
        "sprechen-sms-bestaetigung": "sms:+43660999999",
        "sprechen-wa-bestaetigung": "https://wa.me/43660999999",
        "sprechen-mail-bestaetigung": "mailto:neu@example.test",
      };
      for (const targets of [uiResult.targets, uiResult.targetsAfterReload]) {
        for (const [id, expected] of Object.entries(expectedTargets)) {
          if (String(targets[id] ?? "").split("?")[0] !== expected) {
            throw new Error(`UI confirmation target ${id} was not exact: ${JSON.stringify(targets)}`);
          }
        }
      }
      console.log(JSON.stringify({ confirmationTargetsBeforeReload: uiResult.targets, confirmationTargetsAfterReload: uiResult.targetsAfterReload }));
      console.log(JSON.stringify({ uiMode: true, assistantTexts: uiResult.assistantTexts, userTexts: uiResult.userTexts }));
    } else {
      await login(a, "a");
    }
    if (uiMode) {
      await context.close();
    } else {
    const requestedTime = await specificTimeRequest(a, "a");
    if (
      requestedTime.answer.action.type !== "none" ||
      requestedTime.answer.action.kind !== "Terminwunsch" ||
      requestedTime.answer.action.preferredDate !== undefined ||
      !/nicht automatisch/i.test(requestedTime.answer.text) ||
      requestedTime.saved?.ok !== true ||
      requestedTime.saved?.confirm !== null ||
      requestedTime.saved?.internSkipped !== false ||
      !requestedTime.saved?.intern?.id
    ) {
      throw new Error(`concrete-time request was not safely kept unbooked: ${JSON.stringify(requestedTime)}`);
    }
    const resultA = await callFlow(a, "a", "Ich brauche morgen einen Termin für Audit Hund.");
    const concurrent = await concurrentSlotBooking(a);
    const b = await context.newPage(); await login(b, "b");
    const resultB = await callFlow(b, "b", "Ich brauche morgen einen Termin für Audit Hund.");
    if (resultA.answer.action.type !== "book" || resultA.answer.action.preferredDate == null || resultA.saved?.ok !== true) {
      throw new Error(`practice A booking response invalid: ${JSON.stringify({ answer: resultA.answer, saved: resultA.saved })}`);
    }
    const successfulConcurrent = concurrent.attempts.filter((attempt) => attempt?.ok === true && attempt?.confirm?.id);
    const conflictingConcurrent = concurrent.attempts.filter((attempt) => attempt?.ok === false && attempt?.bookingConflict === true && attempt?.error === concurrent.conflictReply);
    if (concurrent.answer.action.type !== "book" || concurrent.attempts.length !== 2 || successfulConcurrent.length !== 1 || conflictingConcurrent.length !== 1) {
      throw new Error(`parallel same-slot booking did not yield exactly one success and one conflict: ${JSON.stringify(concurrent)}`);
    }
    if (resultB.answer.action.type === "book" || resultB.saved?.ok !== true) {
      throw new Error(`closed practice unexpectedly booked: ${JSON.stringify({ answer: resultB.answer, saved: resultB.saved })}`);
    }
    if (resultA.correction?.action.type !== "none" || !/keinen zweiten Termin/i.test(resultA.correction?.text ?? "")) {
      throw new Error(`concrete-time correction was not kept non-booking: ${JSON.stringify(resultA.correction)}`);
    }
    if (resultA.correctionSaved?.ok !== true || resultA.hours?.action.kind !== "Info" || !/(?:Öffnungszeit|Zeiten)/i.test(resultA.hours?.text ?? "")) {
      throw new Error(`confirmed appointment follow-up was not kept as hours info: ${JSON.stringify({ correctionSaved: resultA.correctionSaved, hours: resultA.hours })}`);
    }
    if (!resultA.saved?.confirm?.id) throw new Error(`practice A booking did not return confirmId: ${JSON.stringify(resultA.saved)}`);
    await context.close();
    await restartReadExistingAppointment(resultA.saved.confirm.id);
    console.log(JSON.stringify({ beforeCount: before.appointments.length, resultA: { action: resultA.answer.action, savedOk: resultA.saved.ok, responseText: resultA.answer.text }, resultB: { action: resultB.answer.action, savedOk: resultB.saved.ok, responseText: resultB.answer.text } }));
    }
  } finally { await browser.close(); }
  await stopServer();
  const db = new PGlite({ dataDir: dbDir }); await db.waitReady;
  const rows = (await db.query("select id,practice_id,start_at,owner_name,pet,kind,vet,channel,status from appointments order by id")).rows;
  const calls = (await db.query("select practice_id,action from calls order by id")).rows;
  const patientsAfter = (await db.query("select id,practice_id,name,species,owner_name,phone,email,notes,source from patients order by id")).rows;
  console.log(JSON.stringify({ finalPatients: patientsAfter, finalAppointments: rows, finalCalls: calls }));
  await db.close();
  const expectedAppointmentCount = uiMode ? 1 : 2;
  if (rows.length !== expectedAppointmentCount || rows.some((row) => row.practice_id !== ids.ap)) throw new Error(`appointment isolation failed: appointments=${JSON.stringify(rows)} calls=${JSON.stringify(calls)}`);
  const beforePatientIds = before.patients.map((row) => row.id).sort();
  const afterPatientIds = patientsAfter.map((row) => row.id).sort();
  if (JSON.stringify(afterPatientIds) !== JSON.stringify(beforePatientIds)) throw new Error(`patient identity set changed: before=${JSON.stringify(beforePatientIds)} after=${JSON.stringify(afterPatientIds)}`);
  const beforeClosed = before.patients.filter((row) => row.practice_id === ids.bp).map(({ id, practice_id, name, species, owner_name, phone, email, source }) => ({ id, practice_id, name, species, owner_name, phone, email, source }));
  const afterClosed = patientsAfter.filter((row) => row.practice_id === ids.bp).map(({ id, practice_id, name, species, owner_name, phone, email, source }) => ({ id, practice_id, name, species, owner_name, phone, email, source }));
  if (JSON.stringify(afterClosed) !== JSON.stringify(beforeClosed)) throw new Error(`closed practice fields changed: before=${JSON.stringify(beforeClosed)} after=${JSON.stringify(afterClosed)}`);
  if (uiMode) {
    const practiceAPatients = patientsAfter.filter((row) => row.practice_id === ids.ap);
    if (practiceAPatients.length !== 1 || practiceAPatients[0].id !== ids.at || practiceAPatients[0].phone !== "0660999999" || practiceAPatients[0].email !== "neu@example.test") {
      throw new Error(`existing patient was not updated in place: ${JSON.stringify(practiceAPatients)}`);
    }
  }
  const viennaDay = (value) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  const days = rows.map((row) => viennaDay(row.start_at)); const expected = uiMode ? [viennaDay(Date.now() + 86400000)] : [viennaDay(Date.now() + 86400000), viennaDay(Date.now() + 2 * 86400000)];
  if (JSON.stringify(days.sort()) !== JSON.stringify(expected.sort())) throw new Error(`requested days mismatch: ${JSON.stringify(days)} != ${JSON.stringify(expected)}`);
  if (uiMode) {
    const time = new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(rows.find((row) => viennaDay(row.start_at) === viennaDay(Date.now() + 86400000)).start_at));
    if (!uiAssistantTexts[3]?.includes(time)) throw new Error(`UI confirmation turn did not repeat persisted appointment time ${time}: ${JSON.stringify(uiAssistantTexts)}`);
  }
  console.log(JSON.stringify({ ok: true, appointments: rows.length, practice: rows[0].practice_id, requestedDays: expected, savedDays: days, uiResponseMatchedPersistedTime: uiMode ? true : undefined, patientIdsUnchanged: true, noAppointmentsInClosedPractice: uiMode ? undefined : true }));
} finally {
  if (server && server.exitCode === null) await stopServer();
  await removeDbSafely();
}
