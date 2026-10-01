#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
const firebird = createRequire(import.meta.url)("C:\\silvia-connector-test\\node_modules\\node-firebird");

const root = "C:\\silvia-connector-test";
const host = "127.0.0.1";
const port = 8766;
const base = `http://${host}:${port}`;
function envParse(raw) { const out = {}; for (const line of raw.split(/\r?\n/)) { const m = line.match(/^\s*([^#=][^=]*)=(.*)$/); if (m) out[m[1].trim()] = m[2].trim(); } return out; }
function freePort() { return new Promise((resolve, reject) => { const s = net.createServer(); s.once("error", reject); s.listen(port, host, () => s.close(() => resolve(true))); }); }
function dbQuery(options, sql, params = []) { return new Promise((resolve, reject) => firebird.attach(options, (error, db) => { if (error) return reject(error); db.query(sql, params, (queryError, rows) => { db.detach(() => {}); if (queryError) reject(queryError); else resolve(rows); }); })); }
async function api(pathname, token) { try { const r = await fetch(`${base}${pathname}`, { redirect: "error", signal: AbortSignal.timeout(1500), headers: token ? { Authorization: `Bearer ${token}` } : {} }); return { status: r.status, body: await r.json() }; } catch { return { status: 0, body: null }; } }
async function main() {
if (["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"].some((key) => String(process.env[key] || "").trim()) || ["1", "true"].includes(String(process.env.NODE_USE_ENV_PROXY || "").toLowerCase())) throw new Error("proxy blocked");
const config = JSON.parse((await readFile(path.join(root, "connector.json"), "utf8")).replace(/^\uFEFF/, ""));
if (config.adapter !== "vquadrat" || config.options?.testDatabase !== true) throw new Error("test configuration required");
const env = envParse(await readFile(path.join(root, ".env"), "utf8"));
if (!env.CONNECTOR_TOKEN?.trim() || !env.FIREBIRD_TEST_DATABASE) throw new Error("test credentials required");
if (env.FIREBIRD_HOST !== "127.0.0.1" || path.resolve(env.FIREBIRD_TEST_DATABASE) !== path.resolve("C:\\silvia-connector\\test\\DATEN_TEST.FDB")) throw new Error("unsafe test database configuration");
await freePort();
const dbOptions = { host, port: Number(env.FIREBIRD_PORT || 3050), database: env.FIREBIRD_TEST_DATABASE, user: env.FIREBIRD_USER, password: env.FIREBIRD_PASSWORD };
const refs = await dbQuery(dbOptions, "SELECT FIRST 1 c.CID AS OWNER_ID, c.NAME AS OWNER_NAME, p.PATID AS PATIENT_ID FROM CONTACTS c JOIN PATIENTS p ON p.CID = c.CID WHERE c.NAME IS NOT NULL ORDER BY c.CID, p.PATID");
if (!refs.length) throw new Error("no owner-patient reference in synthetic test database");
const ref = refs[0];
const child = spawn(process.execPath, ["src/server.mjs"], { cwd: root, env: { PATH: process.env.PATH, CONNECTOR_HOST: host, CONNECTOR_PORT: String(port), CONNECTOR_TOKEN: env.CONNECTOR_TOKEN, FIREBIRD_HOST: host, FIREBIRD_PORT: String(env.FIREBIRD_PORT || 3050), FIREBIRD_DATABASE: env.FIREBIRD_TEST_DATABASE, FIREBIRD_TEST_DATABASE: env.FIREBIRD_TEST_DATABASE, FIREBIRD_USER: env.FIREBIRD_USER, FIREBIRD_PASSWORD: env.FIREBIRD_PASSWORD, SILVIA_WRITE_TEST: "0", NODE_USE_ENV_PROXY: "0", HTTP_PROXY: "", HTTPS_PROXY: "", ALL_PROXY: "" }, stdio: "ignore" });
let exited = false; child.once("exit", () => { exited = true; }); child.once("error", () => { exited = true; });
let result;
let cleanupIncomplete = false;
try {
  let health = null; for (let i = 0; i < 50 && !exited; i++) { health = await api("/health", ""); if (health.status === 200) break; await new Promise((r) => setTimeout(r, 100)); }
  const unauth = await api("/capabilities", "");
  const owners = await api(`/owners?name=${encodeURIComponent(String(ref.OWNER_NAME).slice(0, 3))}`, env.CONNECTOR_TOKEN);
  const ownerMatch = Array.isArray(owners.body) && owners.body.some((row) => String(row.id) === String(ref.OWNER_ID));
  const patients = ownerMatch ? await api(`/owners/${encodeURIComponent(String(ref.OWNER_ID))}/patients`, env.CONNECTOR_TOKEN) : { status: 0, body: null };
  const patientMatch = Array.isArray(patients.body) && patients.body.some((row) => String(row.id) === String(ref.PATIENT_ID) && String(row.ownerId) === String(ref.OWNER_ID));
  result = { health: health?.status ?? 0, unauthorized: unauth.status, ownerSearch: owners.status, ownerReferenceMatch: ownerMatch, patients: patients.status, patientOwnerReferenceMatch: patientMatch };
  if (result.health !== 200 || result.unauthorized !== 401 || result.ownerSearch !== 200 || result.patients !== 200 || !ownerMatch || !patientMatch) throw new Error("owner-patient mapping assertion failed");
} finally {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  await new Promise((resolve) => { if (child.exitCode !== null || child.signalCode !== null) return resolve(); child.once("exit", resolve); setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 2000); setTimeout(resolve, 4000); });
  cleanupIncomplete = child.exitCode === null && child.signalCode === null;
  await freePort();
}
if (cleanupIncomplete) throw new Error("connector did not exit");
console.log(JSON.stringify({ ...result, processStopped: true }));
}
main().catch(() => { console.error(JSON.stringify({ ok: false, error: "local_mapping_audit_failed" })); process.exitCode = 1; });
