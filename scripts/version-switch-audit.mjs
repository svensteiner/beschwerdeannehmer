#!/usr/bin/env node
/**
 * Vollständig lokale, synthetische Probe eines echten Versionswechsels:
 * vorige App-Version -> aktueller Build -> gesperrter Altzugriff -> Rückkehr
 * mit der zur alten Version passenden Datenkopie. Nie Praxisdaten verwenden.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdtemp, readdir, rm, rmdir, symlink, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { request } from "node:http";
import { createServer } from "node:net";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const root = resolve(run("git", ["rev-parse", "--show-toplevel"]).trim());
const safeRoot = root.replace(/\\/g, "/");
const moduleDir = join(root, "node_modules");
const syntheticPracticeId = "version-switch-practice";
const syntheticFactId = "version-switch-fact";
const syntheticFact = "Synthetischer Versionswechsel-Hinweis.";
const syntheticUserId = "version-switch-user";
const syntheticSessionId = "version-switch-session";
const syntheticSessionToken = "synthetic-version-switch-token";
const syntheticSessionHash = createHash("sha256").update(syntheticSessionToken).digest("hex");
const syntheticSessionHeaders = { cookie: `silvia.session=${syntheticSessionToken}` };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new Error(`${command} ${args.join(" ")} fehlgeschlagen (${result.status ?? "Signal"})${detail ? `: ${detail}` : ""}`);
  }
  return String(result.stdout ?? "");
}

function git(args) {
  return run("git", ["-c", `safe.directory=${safeRoot}`, "-C", root, ...args], { cwd: root });
}

function assertWorkingTreeMatchesIndex() {
  try {
    git(["diff", "--quiet"]);
  } catch {
    throw new Error("Versionswechsel-Audit startet nur aus einem zum Index passenden Git-Stand.");
  }
}

async function migrationNames(dir) {
  return (await readdir(join(dir, "migrations")))
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function previousMigrationRef() {
  const commits = git(["log", "--format=%H", "--", "migrations"])
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  assert.ok(commits.length > 0, "Keine Migration im Git-Verlauf gefunden.");
  return git(["rev-parse", `${commits[0]}^`]).trim();
}

function safeChildEnv(worktree, dataDir, extra = {}) {
  const out = {};
  for (const key of [
    "APPDATA", "COMSPEC", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "NUMBER_OF_PROCESSORS",
    "OS", "PATHEXT", "PROCESSOR_ARCHITECTURE", "PROGRAMDATA", "ProgramFiles", "PROGRAMFILES",
    "SYSTEMROOT", "SystemRoot", "TEMP", "TMP", "USERDOMAIN", "USERNAME", "USERPROFILE", "WINDIR",
  ]) {
    if (process.env[key] !== undefined) out[key] = process.env[key];
  }
  const inheritedPath = process.env.PATH ?? process.env.Path ?? "";
  return {
    ...out,
    PATH: `${join(worktree, "node_modules", ".bin")}${delimiter}${inheritedPath}`,
    DATABASE_URL: "",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    SILVIA_DATA_DIR: dataDir,
    SILVIA_ENABLE_GROK_EXTENSIONS: "0",
    SILVIA_LIVE_DEMO_ENABLED: "0",
    NODE_USE_ENV_PROXY: "0",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    ...extra,
  };
}

function stopChildTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && Number.isInteger(child.pid)) {
    spawnSync(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"), ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
  } else {
    child.kill("SIGKILL");
  }
}

async function nodeRun(args, { cwd, env, timeoutMs = 120000 }) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  const completed = new Promise((resolveRun, rejectRun) => {
    child.once("error", rejectRun);
    child.once("close", (exitCode, exitSignal) => resolveRun([exitCode, exitSignal]));
  });
  const timeout = new Promise((resolveTimeout) => setTimeout(() => resolveTimeout("timeout"), timeoutMs));
  const result = await Promise.race([completed, timeout]);
  if (result === "timeout") {
    stopChildTree(child);
    await Promise.race([completed, new Promise((done) => setTimeout(done, 5000))]);
    return { code: null, signal: "timeout", output: logs.join("") };
  }
  const [code, signal] = result;
  return { code, signal, output: logs.join("") };
}

async function build(worktree, dataDir, label) {
  const result = await nodeRun([join(worktree, "scripts", "build-local-node-server.mjs")], {
    cwd: worktree,
    env: safeChildEnv(worktree, dataDir, { SILVIA_LOCAL_NITRO: "1" }),
  });
  assert.equal(result.code, 0, `${label}-Build fehlgeschlagen: ${result.output.slice(-4000)}`);
  assert.ok(existsSync(join(worktree, ".output", "server", "index.mjs")), `${label}-Build enthält keinen lokalen Server.`);
}

function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => rejectPort(new Error("Temporärer Port konnte nicht gelesen werden.")));
        return;
      }
      const port = address.port;
      server.close((error) => error ? rejectPort(error) : resolvePort(port));
    });
  });
}

function get(port, path, headers = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET", agent: false, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.once("end", () => resolveRequest({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.setTimeout(5000, () => req.destroy(new Error(`${path} antwortet nicht rechtzeitig`)));
    req.once("error", rejectRequest);
    req.end();
  });
}

function start(worktree, dataDir, port) {
  const child = spawn(process.execPath, [join(worktree, ".output", "server", "index.mjs")], {
    cwd: worktree,
    env: safeChildEnv(worktree, dataDir, { HOST: "127.0.0.1", PORT: String(port), NITRO_HOST: "127.0.0.1", NITRO_PORT: String(port) }),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  return { child, logs };
}

async function waitFor(server, port, path = "/login") {
  const deadline = Date.now() + 30000;
  let lastError = "";
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null || server.child.signalCode !== null) {
      throw new Error(`Testserver endete vor dem Start: ${server.logs.join("")}`);
    }
    try {
      const response = await get(port, path);
      if (response.status > 0) return response;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((done) => setTimeout(done, 150));
  }
  throw new Error(`Testserver wurde nicht bereit (${lastError}): ${server.logs.join("")}`);
}

async function stop(server) {
  if (!server || server.child.exitCode !== null || server.child.signalCode !== null) return;
  const exited = once(server.child, "exit");
  server.child.kill("SIGTERM");
  await Promise.race([exited, new Promise((done) => setTimeout(done, 3000))]);
  if (server.child.exitCode === null && server.child.signalCode === null && Number.isInteger(server.child.pid)) {
    const taskkill = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");
    if (process.platform === "win32") spawnSync(taskkill, ["/PID", String(server.child.pid), "/T", "/F"], { windowsHide: true });
    else server.child.kill("SIGKILL");
    await Promise.race([once(server.child, "exit"), new Promise((done) => setTimeout(done, 3000))]);
  }
  assert.ok(server.child.exitCode !== null || server.child.signalCode !== null, "Testserver läuft noch; Testdaten werden nicht entfernt.");
}

async function withDb(dataDir, action) {
  const db = new PGlite({ dataDir });
  try {
    await db.waitReady;
    return await action(db);
  } finally {
    await db.close();
  }
}

async function prepareOldData(dataDir, expectedMigrations) {
  return withDb(dataDir, async (db) => {
    const migrations = (await db.query("select name from _migrations order by name")).rows.map((row) => String(row.name));
    assert.deepEqual(migrations, expectedMigrations, "Altversion hat nicht genau ihren Migrationsstand erstellt.");
    await db.query(
      "insert into practices (id, name, owner_name, email) values ($1, $2, $3, $4)",
      [syntheticPracticeId, "Versionswechsel Testordination", "Testinhaberin", "version-switch@example.test"],
    );
    await db.query(
      "insert into practice_facts (id, practice_id, fact) values ($1, $2, $3)",
      [syntheticFactId, syntheticPracticeId, syntheticFact],
    );
    await db.query(
      "insert into practice_users (id, practice_id, email, password_hash, name) values ($1, $2, $3, $4, $5)",
      [syntheticUserId, syntheticPracticeId, "version-switch-user@example.test", "synthetic-password-hash", "Testinhaberin"],
    );
    await db.query(
      "insert into practice_sessions (id, user_id, token_hash, expires_at) values ($1, $2, $3, now() + interval '1 day')",
      [syntheticSessionId, syntheticUserId, syntheticSessionHash],
    );
    const rows = await db.query(
      "select p.id, p.name, f.id as fact_id, f.fact from practices p join practice_facts f on f.practice_id = p.id where p.id = $1",
      [syntheticPracticeId],
    );
    assert.deepEqual(rows.rows, [{ id: syntheticPracticeId, name: "Versionswechsel Testordination", fact_id: syntheticFactId, fact: syntheticFact }]);
  });
}

async function inspectData(dataDir) {
  return withDb(dataDir, async (db) => {
    const migrations = (await db.query("select name from _migrations order by name")).rows.map((row) => String(row.name));
    const rows = await db.query(
      "select p.id, p.name, f.id as fact_id, f.fact from practices p join practice_facts f on f.practice_id = p.id where p.id = $1",
      [syntheticPracticeId],
    );
    return { migrations, rows: rows.rows };
  });
}

function assertDataSnapshot(snapshot, expectedMigrations) {
  assert.deepEqual(snapshot.migrations, expectedMigrations, "Datenbank hat nicht den erwarteten Migrationsstand.");
  assert.deepEqual(snapshot.rows, [{ id: syntheticPracticeId, name: "Versionswechsel Testordination", fact_id: syntheticFactId, fact: syntheticFact }]);
}

function assertInside(tempRoot, target) {
  const rel = relative(resolve(tempRoot), resolve(target));
  assert.ok(rel && rel !== "." && !rel.startsWith("..") && !isAbsolute(rel), "Unsicheres temporäres Ziel.");
}

async function removeWorktree(tempRoot, worktree) {
  if (!worktree || !existsSync(worktree)) return;
  assertInside(tempRoot, worktree);
  const dependencyLink = join(worktree, "node_modules");
  const linkInfo = await lstat(dependencyLink).catch(() => undefined);
  if (linkInfo) {
    assert.ok(linkInfo.isSymbolicLink(), "Test-Arbeitskopie enthält keinen erwarteten Abhängigkeits-Link.");
    // Windows Junctions müssen mit rmdir entfernt werden: fs.rm({ recursive })
    // kann sonst dem Link folgen und den echten lokalen Paketordner leeren.
    if (process.platform === "win32") await rmdir(dependencyLink);
    else await unlink(dependencyLink);
    assert.equal(existsSync(dependencyLink), false, "Abhängigkeits-Link blieb in der Test-Arbeitskopie bestehen.");
  }
  git(["worktree", "remove", "--force", worktree]);
}

assertWorkingTreeMatchesIndex();
assert.ok(existsSync(moduleDir), "Lokale Abhängigkeiten fehlen; zuerst npm ci ausführen.");
const oldRef = previousMigrationRef();
const currentRef = git(["rev-parse", "HEAD"]).trim();
const tempRoot = await mkdtemp(join(tmpdir(), "silvia-version-switch-"));
const oldWorktree = join(tempRoot, "old");
const currentWorktree = join(tempRoot, "current");
const dataDir = join(tempRoot, "data");
const rollbackDataDir = join(tempRoot, "rollback-data");
let oldServer;
let currentServer;
let rollbackServer;
let succeeded = false;
let blockedOldStatus = 0;

try {
  git(["worktree", "add", "--detach", oldWorktree, oldRef]);
  git(["worktree", "add", "--detach", currentWorktree, currentRef]);
  await symlink(moduleDir, join(oldWorktree, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await symlink(moduleDir, join(currentWorktree, "node_modules"), process.platform === "win32" ? "junction" : "dir");

  const oldMigrations = await migrationNames(oldWorktree);
  const currentMigrations = await migrationNames(currentWorktree);
  assert.ok(currentMigrations.some((name) => !oldMigrations.includes(name)), "Vorversion enthält keine fehlende Migration; kein echter Versionswechsel testbar.");

  await build(oldWorktree, dataDir, "Altversion");
  const oldPort = await freePort();
  oldServer = start(oldWorktree, dataDir, oldPort);
  const oldLogin = await waitFor(oldServer, oldPort);
  assert.equal(oldLogin.status, 200, "Altversion liefert /login nicht.");
  await stop(oldServer);
  oldServer = undefined;
  await prepareOldData(dataDir, oldMigrations);
  await cp(dataDir, rollbackDataDir, { recursive: true, errorOnExist: true });

  await build(currentWorktree, dataDir, "Aktuelle Version");
  const currentPort = await freePort();
  currentServer = start(currentWorktree, dataDir, currentPort);
  const currentLogin = await waitFor(currentServer, currentPort);
  const currentSpeech = await get(currentPort, "/sprechen");
  const currentApp = await get(currentPort, "/app", syntheticSessionHeaders);
  assert.equal(currentLogin.status, 200, "Aktuelle Version liefert /login nicht.");
  assert.equal(currentSpeech.status, 200, "Aktuelle Version liefert /sprechen nicht.");
  assert.equal(currentApp.status, 200, `Aktuelle Version kann die aktualisierte Datenbank nicht öffnen (${currentApp.status}).`);
  await stop(currentServer);
  currentServer = undefined;
  assertDataSnapshot(await inspectData(dataDir), currentMigrations);

  const blockedPort = await freePort();
  oldServer = start(oldWorktree, dataDir, blockedPort);
  await waitFor(oldServer, blockedPort);
  blockedOldStatus = (await get(blockedPort, "/app", syntheticSessionHeaders)).status;
  assert.ok(blockedOldStatus >= 500, `Altversion durfte die aktualisierte Datenbank noch verwenden (${blockedOldStatus}).`);
  await stop(oldServer);
  oldServer = undefined;
  assertDataSnapshot(await inspectData(dataDir), currentMigrations);

  await rm(dataDir, { recursive: true, force: true });
  await cp(rollbackDataDir, dataDir, { recursive: true, errorOnExist: true });
  const rollbackPort = await freePort();
  rollbackServer = start(oldWorktree, dataDir, rollbackPort);
  const rollbackLogin = await waitFor(rollbackServer, rollbackPort);
  const rollbackApp = await get(rollbackPort, "/app", syntheticSessionHeaders);
  assert.equal(rollbackLogin.status, 200, "Rückkehr zur Altversion liefert /login nicht.");
  assert.equal(rollbackApp.status, 200, `Rückkehr kann die passende alte Datenbank nicht öffnen (${rollbackApp.status}).`);
  await stop(rollbackServer);
  rollbackServer = undefined;
  assertDataSnapshot(await inspectData(dataDir), oldMigrations);
  succeeded = true;
} finally {
  await stop(oldServer);
  await stop(currentServer);
  await stop(rollbackServer);
  await removeWorktree(tempRoot, currentWorktree);
  await removeWorktree(tempRoot, oldWorktree);
  assertInside(dirname(tempRoot), tempRoot);
  assert.ok(resolve(tempRoot).startsWith(join(resolve(tmpdir()), "silvia-version-switch-")), "Unsicheres Temp-Ziel.");
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

if (succeeded) {
  console.log(JSON.stringify({
    ok: true,
    audit: "synthetic-version-switch",
    oldRef: oldRef.slice(0, 12),
    currentRef: currentRef.slice(0, 12),
    oldRuntimeStatusAfterUpgrade: blockedOldStatus,
    oldVersionBlockedAfterUpgrade: true,
    rollbackWithMatchingBackup: true,
    tempRemoved: true,
  }));
  // PGlite can retain a harmless worker handle after all test directories and
  // servers are closed. At this point cleanup has completed, so end the audit
  // deterministically for CI instead of leaving a successful test process open.
  process.exit(0);
}
