#!/usr/bin/env node
/**
 * Full local read-only path: Vquadrat test copy -> connector -> Silvia bridge
 * (PGlite in memory). No records are printed and no write mode is available.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";

// This audit may only execute the separately prepared, local test connector.
// An environment override is accepted solely when it resolves to that same path.
const connectorRoot = await realpath("C:\\silvia-connector-test");
if (process.env.SILVIA_PMS_E2E_CONNECTOR_ROOT) {
  const requestedRoot = await realpath(process.env.SILVIA_PMS_E2E_CONNECTOR_ROOT);
  assert.equal(
    requestedRoot.toLowerCase(),
    connectorRoot.toLowerCase(),
    "Der E2E-Test darf nur den freigegebenen Vquadrat-Testconnector starten.",
  );
}
const config = JSON.parse(await readFile(join(connectorRoot, "connector.json"), "utf8"));
const envText = await readFile(join(connectorRoot, ".env"), "utf8");
const connectorEnv = Object.fromEntries(
  envText.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    return match ? [[match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, "")]] : [];
  }),
);

assert.equal(config.adapter, "vquadrat", "Kein Vquadrat-Testconnector.");
assert.equal(config.options?.testDatabase, true, "Der Connector ist nicht auf die Testkopie begrenzt.");
assert.ok(["127.0.0.1", "localhost", "::1"].includes(connectorEnv.FIREBIRD_HOST || "127.0.0.1"), "Firebird muss lokal laufen.");
assert.equal(
  String(connectorEnv.FIREBIRD_TEST_DATABASE || "").toLowerCase(),
  "c:\\silvia-connector\\test\\daten_test.fdb",
  "Unerwartete Vquadrat-Testdatenbank.",
);
assert.ok(connectorEnv.CONNECTOR_TOKEN, "Dem lokalen Connector fehlt ein Token.");

const port = Number(connectorEnv.CONNECTOR_PORT || "8766");
assert.ok(Number.isInteger(port) && port > 0 && port < 65536, "Ungültiger lokaler Connector-Port.");
async function assertPortFree() {
  const probe = createServer();
  await new Promise((resolve, reject) => probe.once("error", reject).listen(port, "127.0.0.1", resolve));
  await new Promise((resolve) => probe.close(resolve));
}
await assertPortFree();

const safeEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|APPDATA|LOCALAPPDATA|USERPROFILE)$/i.test(key)),
);
const connector = spawn(process.execPath, ["src/server.mjs"], {
  cwd: connectorRoot,
  env: {
    ...safeEnv,
    CONNECTOR_HOST: "127.0.0.1",
    CONNECTOR_PORT: String(port),
    CONNECTOR_TOKEN: connectorEnv.CONNECTOR_TOKEN,
    FIREBIRD_HOST: connectorEnv.FIREBIRD_HOST || "127.0.0.1",
    FIREBIRD_PORT: connectorEnv.FIREBIRD_PORT || "3050",
    FIREBIRD_DATABASE: connectorEnv.FIREBIRD_TEST_DATABASE,
    FIREBIRD_TEST_DATABASE: connectorEnv.FIREBIRD_TEST_DATABASE,
    FIREBIRD_USER: connectorEnv.FIREBIRD_USER || "",
    FIREBIRD_PASSWORD: connectorEnv.FIREBIRD_PASSWORD || "",
    SILVIA_WRITE_TEST: "0",
    SILVIA_WRITE_LIVE: "0",
  },
  stdio: "ignore",
  windowsHide: true,
});

async function stopConnector() {
  if (connector.exitCode === null && connector.signalCode === null) {
    const exited = new Promise((resolve) => connector.once("exit", resolve));
    connector.kill();
    await exited;
  }
  await assertPortFree();
}

function requireOutput(output, expression, label) {
  if (!expression.test(output)) throw new Error(`Bridge-Nachweis fehlt: ${label}`);
}

async function stopChild(child) {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await exited;
  }
}

try {
  let health;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    assert.equal(connector.exitCode, null, "Der eigene Connector wurde vorzeitig beendet.");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        health = await response.json();
        break;
      }
      await response.body?.cancel();
    } catch { /* Connector startet noch. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(health, "Der lokale Connector wurde nicht bereit.");
  assert.equal(health.readOnly, true, "Der Testconnector darf keine Termine schreiben.");
  const capabilitiesResponse = await fetch(`http://127.0.0.1:${port}/capabilities`, {
    headers: { authorization: `Bearer ${connectorEnv.CONNECTOR_TOKEN}` },
    signal: AbortSignal.timeout(1_000),
  });
  assert.equal(capabilitiesResponse.ok, true, "Capabilities des Testconnectors nicht lesbar.");
  const capabilities = await capabilitiesResponse.json();
  assert.equal(capabilities.write?.appointment, false, "Termin-Schreiben muss im E2E-Test deaktiviert sein.");
  const e2e = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/_e2e-pms-bridge.mts"], {
    cwd: process.cwd(),
    env: {
      ...safeEnv,
      SILVIA_PMS_URL: `http://127.0.0.1:${port}`,
      SILVIA_PMS_TOKEN: connectorEnv.CONNECTOR_TOKEN,
      SILVIA_WRITE_TEST: "0",
      SILVIA_WRITE_LIVE: "0",
      SILVIA_PMS_E2E_OUTAGE: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  e2e.stdout.on("data", (chunk) => { stdout += String(chunk); });
  e2e.stderr.resume();
  try {
    let outageReady = false;
    // Ein kalter Windows-Start der rein lokalen PGlite-Testdatenbank kann
    // länger als sechs Sekunden dauern. Das ist kein Connector-Ausfall.
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (stdout.includes("8) outage-ready")) { outageReady = true; break; }
      assert.equal(e2e.exitCode, null, "Der Silvia-Bridge-Test endete vor dem Ausfalltest.");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(outageReady, true, "Der Silvia-Bridge-Test wurde nicht für den Ausfalltest bereit.");
    await stopConnector();
    e2e.stdin.write("outage\n");
    e2e.stdin.end();
    const code = await new Promise((resolve) => e2e.once("exit", resolve));
    assert.equal(code, 0, "Der lokale Silvia-Bridge-Test ist fehlgeschlagen.");
    requireOutput(stdout, /syncMasterData:\s+true/, "Stammdaten-Sync");
    requireOutput(stdout, /syncOwnerByName\('a'\):\s+true/, "Halter-Sync");
    requireOutput(stdout, /read-through resources:\s+true\s+\d+\s+\| adapterCalls = 0 .* true/, "Bridge-Cache");
    requireOutput(stdout, /gleiche IDs:\s+true/, "Halter-Tier-Zuordnung");
    requireOutput(stdout, /vets:\s+\d+\s+\| hours:\s+ok/, "Tierärzte und Öffnungszeiten");
    requireOutput(stdout, /6f\) freeSlots morgen \(Echtzeit\):\s+\d+/, "freie Termine");
    requireOutput(stdout, /flushOutbox \(leer\):\s+true/, "leere Outbox");
    requireOutput(stdout, /9\) outage: cache=true cacheReadOnly=true slotsBlocked=true writes=0 emptyOutbox=true/, "kontrollierter Connector-Ausfall");
  } finally {
    await stopChild(e2e);
  }
  console.log(JSON.stringify({
    ok: true,
    testCopy: true,
    masterSync: true,
    bridgeReadThrough: true,
    slotsLiveRead: true,
    emptyOutbox: true,
    connectorOutageFailClosed: true,
    connectorReadOnly: true,
    appointmentWriteEnabled: false,
  }));
} finally {
  await stopConnector();
}
