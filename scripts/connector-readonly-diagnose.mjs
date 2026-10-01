#!/usr/bin/env node
/**
 * Read-only smoke diagnosis for the isolated Vquadrat connector test copy.
 * No response body or identifying value is printed; only status/count/schema.
 */
import { readFile, realpath } from "node:fs/promises";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";

const configuredRoot = process.env.CONNECTOR_TEST_ROOT;
const requestedRoot = configuredRoot || "C:\\silvia-connector-test";
const allowedRoot = await realpath("C:\\silvia-connector-test");
let root;
try {
  root = await realpath(requestedRoot);
} catch {
  throw new Error("CONNECTOR_TEST_ROOT must resolve to C:\\silvia-connector-test");
}
if (root.toLowerCase() !== allowedRoot.toLowerCase()) {
  throw new Error("CONNECTOR_TEST_ROOT must resolve to C:\\silvia-connector-test");
}
const host = "127.0.0.1";
const port = 8766;
const base = `http://${host}:${port}`;

if (["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]
  .some((key) => String(process.env[key] || "").trim()) ||
  ["1", "true"].includes(String(process.env.NODE_USE_ENV_PROXY || "").toLowerCase())) {
  throw new Error("proxy environment is not allowed for this local audit");
}

function parseEnv(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=][^=]*)=(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

function portFree() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error) => reject(error));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

async function request(pathname, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  try {
    const response = await fetch(`${base}${pathname}`, { headers, redirect: "error", signal: AbortSignal.timeout(1500) });
    let json = null;
    try { json = await response.json(); } catch { /* status is sufficient */ }
    return { status: response.status, json };
  } catch {
    return { status: 0, json: null };
  }
}

async function waitForHealth(child) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline && child.exitCode === null && child.signalCode === null && child.pid) {
    const result = await request("/health", "");
    if (result.status === 200) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

const envFile = parseEnv(await readFile(path.join(root, ".env"), "utf8"));
const config = JSON.parse((await readFile(path.join(root, "connector.json"), "utf8")).replace(/^\uFEFF/, ""));
if (!envFile.CONNECTOR_TOKEN?.trim()) throw new Error("connector token required");
if (config.adapter !== "vquadrat" || config.options?.testDatabase !== true) {
  throw new Error("test copy must use vquadrat with testDatabase=true");
}
if (!envFile.FIREBIRD_TEST_DATABASE || path.resolve(envFile.FIREBIRD_TEST_DATABASE) !== path.resolve("C:\\silvia-connector\\test\\DATEN_TEST.FDB")) {
  throw new Error("unexpected synthetic test database path");
}
if ((envFile.FIREBIRD_HOST || "127.0.0.1") !== "127.0.0.1") throw new Error("test database host must be local");
await portFree();
const child = spawn(process.execPath, ["src/server.mjs"], {
  cwd: root,
  env: {
    PATH: process.env.PATH,
    CONNECTOR_HOST: host,
    CONNECTOR_PORT: String(port),
    CONNECTOR_TOKEN: envFile.CONNECTOR_TOKEN || "",
    FIREBIRD_HOST: envFile.FIREBIRD_HOST || host,
    FIREBIRD_PORT: envFile.FIREBIRD_PORT || "3050",
    FIREBIRD_DATABASE: envFile.FIREBIRD_TEST_DATABASE || "",
    FIREBIRD_USER: envFile.FIREBIRD_USER || "",
    FIREBIRD_PASSWORD: envFile.FIREBIRD_PASSWORD || "",
    SILVIA_WRITE_TEST: "0",
    NODE_USE_ENV_PROXY: "0",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
  },
  stdio: "ignore",
});
let exitCode = null;
let spawnError = null;
child.once("exit", (code) => { exitCode = code; });
child.once("error", (error) => { spawnError = error; });
let result = { started: false };
let cleanupIncomplete = false;
try {
  result.started = await waitForHealth(child);
  if (spawnError || !result.started) throw new Error("connector did not reach health endpoint");
  const token = envFile.CONNECTOR_TOKEN || "";
  const health = await request("/health", "");
  const unauthorized = await request("/capabilities", "");
  const capabilities = await request("/capabilities", token);
  const resources = await request("/resources", token);
  const vets = await request("/vets", token);
  const hours = await request("/hours", token);
  const owners = await request("/owners?name=synthetic", token);
  const patients = await request("/patients?name=synthetic", token);
  result = {
    started: result.started,
    health: health.status,
    unauthorized: unauthorized.status,
    capabilities: capabilities.status,
    resources: resources.status,
    resourcesCount: Array.isArray(resources.json) ? resources.json.length : -1,
    vets: vets.status,
    vetsCount: Array.isArray(vets.json) ? vets.json.length : -1,
    hours: hours.status,
    hoursSchema: Boolean(hours.json && typeof hours.json === "object" && "closedDays" in hours.json),
    owners: owners.status,
    ownersCount: Array.isArray(owners.json) ? owners.json.length : -1,
    patients: patients.status,
    patientsCount: Array.isArray(patients.json) ? patients.json.length : -1,
    ownerPatientMappingChecked: false,
    ownerPatientMappingNote: "no safe synthetic reference lookup available; empty-search acceptance only",
  };
  const expected = [health.status, unauthorized.status, capabilities.status, resources.status, vets.status, hours.status, owners.status, patients.status];
  if (expected.join(",") !== "200,401,200,200,200,200,200,200" || !result.hoursSchema || result.resourcesCount < 0 || result.vetsCount < 0 || result.ownersCount < 0 || result.patientsCount < 0) {
    throw new Error("readonly connector assertion failed");
  }
} finally {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once("exit", resolve);
    setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 2000);
    setTimeout(resolve, 4000);
  });
  exitCode ??= child.exitCode ?? child.signalCode ?? "terminated";
  cleanupIncomplete = child.exitCode === null && child.signalCode === null;
  await portFree();
}
if (cleanupIncomplete) throw new Error("connector process did not exit");
console.log(JSON.stringify({ ...result, processStopped: child.exitCode !== null || child.signalCode !== null, exitCode }));
