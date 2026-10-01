#!/usr/bin/env node
/** Offline audit of a clean, local Windows installation. */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { copyFile, lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "node:http";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import { assertSupportedProductionNode } from "./node-runtime.mjs";

assertSupportedProductionNode();
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const forbidden = /(^|[\\/])(?:\.env[^\\/]*|\.silvia-data(?:\.bak-[^\\/]*)?|\.output|\.grok|\.claude|\.agents|node_modules|backups?|artifacts)([\\/]|$)|\.(?:bak|sqlite|db|FDB|tar|tar\.gz|zip)$/i;

function trackedFiles() {
  return execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "buffer" })
    .toString("utf8").split("\0").filter(Boolean)
    .filter((file) => !forbidden.test(file));
}

function assertWorkingTreeMatchesIndex() {
  const result = spawnSync("git", ["-C", root, "diff", "--quiet"], { windowsHide: true });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, "Arbeitsbaum weicht vom gestageten Stand ab; bitte zuerst stagen.");
}

async function copyStagedFiles(temp, files) {
  const tempRoot = resolve(temp);
  for (const file of files) {
    const from = join(root, file);
    const source = await realpath(from);
    const info = await lstat(from);
    assert(info.isFile(), `Keine reguläre Datei: ${file}`);
    assert(source === root || source.startsWith(`${root}${sep}`), `Quelle außerhalb: ${file}`);
    const to = resolve(temp, file);
    assert(to.startsWith(`${tempRoot}${sep}`), `Ziel außerhalb: ${file}`);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
  }
}

async function cleanEnv(temp, port) {
  const profile = join(temp, ".audit-profile");
  const localAppData = join(profile, "AppData", "Local");
  const tempDir = join(temp, ".audit-tmp");
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  assert(systemRoot, "Windows-Systemordner fehlt");
  const npmCache = process.env.npm_config_cache || join(process.env.LOCALAPPDATA || "", "npm-cache");
  assert(npmCache && existsSync(npmCache), "Lokaler npm-Cache fehlt; Offline-Installationsaudit nicht möglich");
  await Promise.all([mkdir(profile, { recursive: true }), mkdir(localAppData, { recursive: true }), mkdir(tempDir, { recursive: true })]);
  return {
    PATH: [join(temp, "node_modules", ".bin"), dirname(process.execPath), join(systemRoot, "System32"), systemRoot].join(delimiter),
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    ComSpec: process.env.ComSpec || join(systemRoot, "System32", "cmd.exe"),
    TEMP: tempDir,
    TMP: tempDir,
    USERPROFILE: profile,
    APPDATA: join(profile, "AppData", "Roaming"),
    LOCALAPPDATA: localAppData,
    HOST: "127.0.0.1",
    PORT: String(port),
    VITE_AUTH_ENABLED: "false",
    SILVIA_LOCAL_NITRO: "1",
    SILVIA_DATA_DIR: "memory",
    SILVIA_LIVE_DEMO_ENABLED: "0",
    SILVIA_LLM_PROVIDER: "",
    SILVIA_LLM_BASE_URL: "",
    DATABASE_URL: "",
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    KIMI_API_KEY: "",
    GEMINI_API_KEY: "",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    http_proxy: "",
    https_proxy: "",
    all_proxy: "",
    NODE_USE_ENV_PROXY: "0",
    npm_config_cache: npmCache,
    npm_config_userconfig: join(profile, ".npmrc"),
    npm_config_globalconfig: join(profile, "npmrc-global"),
    npm_config_loglevel: "error",
  };
}

function npmCommand() {
  const candidates = [join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), join(process.env.ProgramFiles || "", "nodejs", "node_modules", "npm", "bin", "npm-cli.js")];
  const found = candidates.find((file) => file && existsSync(file));
  if (found) return { command: process.execPath, args: [found] };
  throw new Error("Keine npm-cli.js gefunden; npm_execpath oder Node.js-Installation erforderlich");
}

function run(command, args, options) {
  const result = spawnSync(command, args, { ...options, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} ${args.join(" ")} fehlgeschlagen: ${result.status}`);
}

function freePort() {
  return new Promise((resolvePort, reject) => { const s = createServer(); s.once("error", reject); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close((error) => error ? reject(error) : resolvePort(p)); }); });
}

const FRESH_ROUTES = ["/login", "/sprechen", "/preise", "/api/live-demo/status"];

function getRoute(port, path) {
  return new Promise((resolveCheck, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.once("end", () => resolveCheck({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.setTimeout(5_000, () => req.destroy(new Error(`${path} antwortet nicht rechtzeitig`)));
    req.once("error", reject);
    req.end();
  });
}

async function waitRoutes(port, timeout = 30000) {
  const started = Date.now();
  let last = {};
  while (Date.now() - started <= timeout) {
    try {
      last = Object.fromEntries(await Promise.all(FRESH_ROUTES.map(async (path) => [path, await getRoute(port, path)])));
      if (Object.values(last).every((result) => result.status === 200)) return last;
    } catch {
      // Der frisch gestartete Server kann während des ersten Aufbaus noch nicht lauschen.
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`Frischinstallation antwortet nicht vollständig mit 200: ${JSON.stringify(last)}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  assert.ok(Number.isInteger(child.pid) && child.pid > 0, "Testserver hat keine gültige Prozess-ID.");
  const exited = new Promise((done) => child.once("exit", done));
  if (process.platform === "win32") {
    spawnSync(join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe"), ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
  } else {
    child.kill("SIGTERM");
  }
  await Promise.race([exited, new Promise((done) => setTimeout(done, 5000))]);
  assert.ok(child.exitCode !== null || child.signalCode !== null, "Testserver läuft noch; Tempordner wird nicht gelöscht.");
}

function startServer(temp, env, port) {
  return spawn(process.execPath, [join(temp, "scripts", "start-desk.mjs"), "--skip-build", "--port", String(port)], {
    cwd: temp,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
}

const temp = await mkdtemp(join(tmpdir(), "silvia-fresh-install-"));
let child;
let succeeded = false;
let initialRoutes = {};
let restartRoutes = {};
try {
  assertWorkingTreeMatchesIndex();
  const files = trackedFiles();
  assert(files.length > 0, "Keine getrackten Dateien gefunden");
  await copyStagedFiles(temp, files);
  assert(!existsSync(join(temp, ".env")), ".env wurde kopiert");
  const env = await cleanEnv(temp, await freePort());
  const npm = npmCommand();
  run(npm.command, [...npm.args, "ci", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: temp, env });
  run(process.execPath, [join(temp, "scripts", "build-local-node-server.mjs")], { cwd: temp, env });
  const port = Number(env.PORT);
  child = startServer(temp, env, port);
  initialRoutes = await waitRoutes(port);
  assert.equal(JSON.parse(initialRoutes["/api/live-demo/status"].body).enabled, false, "Live-Demo muss in der Frischinstallation deaktiviert bleiben");
  await stopServer(child);
  child = startServer(temp, env, port);
  restartRoutes = await waitRoutes(port);
  assert.equal(JSON.parse(restartRoutes["/api/live-demo/status"].body).enabled, false, "Live-Demo muss auch nach Neustart deaktiviert bleiben");
  succeeded = true;
} finally {
  await stopServer(child);
  const tempBase = resolve(tmpdir());
  assert(resolve(dirname(temp)) === tempBase && temp.startsWith(join(tempBase, "silvia-fresh-install-")), "Unsicheres Temp-Ziel");
  await rm(temp, { recursive: true, force: true });
}
if (succeeded) console.log(JSON.stringify({
  ok: true,
  audit: "staged-local-install",
  npmInstallOffline: true,
  dependencyLifecycleScripts: false,
  initialRoutes: Object.fromEntries(Object.entries(initialRoutes).map(([path, result]) => [path, result.status])),
  restartRoutes: Object.fromEntries(Object.entries(restartRoutes).map(([path, result]) => [path, result.status])),
  liveDemoEnabled: false,
  tempRemoved: true,
}));
