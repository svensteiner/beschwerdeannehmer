// Wiederverwendbarer, isolierter Starter: keine .env und keine Praxisdaten.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { appendFile, mkdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { createServer } from "node:net";

const buildRoot = await realpath(resolve(process.argv[2] || "."));
const tempRoot = await realpath(tmpdir());
assert(buildRoot.toLowerCase().startsWith(`${tempRoot}${sep}silvia-home-audit-`.toLowerCase()), "Nur bekannte isolierte Tempkopien erlaubt");
const audit = process.argv[3];
assert(["homepage-acceptance-audit.mjs", "homepage-greeting-audit.mjs", "training-retry-audit.mjs", "homepage-audio-error-audit.mjs", "homepage-cta-immediate-audit.mjs", "homepage-product-film-audit.mjs", "homepage-controls-audit.mjs", "homepage-link-click-audit.mjs", "homepage-call-teardown-audit.mjs", "homepage-barge-audit.mjs", "live-demo-audit.mjs", "privacy-demo-flag-audit.mjs", "privacy-practice-facts-audit.mjs", "privacy-practice-stt-audit.mjs", "homepage-knowledge-management-audit.mjs", "homepage-training-capacity-audit.mjs", "homepage-negation-audit.mjs"].includes(audit), "Unbekannter Audit");
let auditDataDir = "memory";
if (process.env.AUDIT_DATA_DIR) {
  assert(["privacy-practice-facts-audit.mjs", "privacy-practice-stt-audit.mjs"].includes(audit), "Nur die Praxistrennungs-Audits duerfen eine Datenbankfixture nutzen.");
  const dataDir = await realpath(resolve(process.env.AUDIT_DATA_DIR));
  const tempDir = await realpath(tmpdir());
  const prefix = join(tempDir, "silvia-privacy-facts-");
  assert(dataDir.startsWith(prefix) && basename(dataDir) === "data" && dirname(dirname(dataDir)).toLowerCase() === tempDir.toLowerCase(), "Nur die eigene synthetische PGlite-Fixture unter Temp ist erlaubt.");
  auditDataDir = dataDir;
}
let localSttUrl = "";
if (process.env.AUDIT_LOCAL_STT_URL) {
  assert.equal(audit, "privacy-practice-stt-audit.mjs", "Nur der STT-Praxistrennungs-Audit darf einen lokalen STT-Mock nutzen.");
  const candidate = new URL(process.env.AUDIT_LOCAL_STT_URL);
  assert.equal(candidate.protocol, "http:");
  assert.equal(candidate.hostname, "127.0.0.1");
  assert(candidate.port && candidate.port !== "8092", "Der STT-Mock muss einen eigenen Loopback-Port verwenden.");
  localSttUrl = candidate.toString();
}
const port = 8183;
const realLocalTts = process.env.REAL_LOCAL_TTS === "1";
const ttsPort = 8184;
// Der Live-Audit prüft absichtlich zwei 15-Sekunden-Zeitüberschreitungen und
// mehrere getrennte Browser-Sitzungen. Auf langsameren Rechnern braucht er
// daher ein eigenes, weiterhin begrenztes Zeitfenster.
// Die Frist bleibt bewusst begrenzt (kein unbegrenztes Hängen), kann aber für
// ausdrücklich langsamere Rechner über AUDIT_TIMEOUT_MS angehoben werden.
const defaultAuditTimeoutMs = audit === "live-demo-audit.mjs" ? 180_000 : 110_000;
const overrideTimeoutMs = Number(process.env.AUDIT_TIMEOUT_MS);
const auditTimeoutMs = Number.isFinite(overrideTimeoutMs) && overrideTimeoutMs > 0
  ? overrideTimeoutMs
  : defaultAuditTimeoutMs;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(key)));
Object.assign(env, {
  SILVIA_DATA_DIR: auditDataDir, SILVIA_LIVE_DEMO_ENABLED: "0",
  SILVIA_LLM_PROVIDER: "local", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", XAI_API_KEY: "", GEMINI_API_KEY: "",
  PORT: String(port), NITRO_PORT: String(port), HOST: "127.0.0.1", NITRO_HOST: "127.0.0.1",
  AUDIT_URL: `http://127.0.0.1:${port}`, AUDIT_BUILD_ROOT: buildRoot, AUDIT_ENTRY: "homepage",
  AUDIT_STORAGE_FAIL_ONCE: process.env.AUDIT_STORAGE_FAIL_ONCE === "1" ? "1" : "",
  AUDIT_PRACTICE_A_TOKEN: process.env.AUDIT_PRACTICE_A_TOKEN || "",
  AUDIT_PRACTICE_B_TOKEN: process.env.AUDIT_PRACTICE_B_TOKEN || "",
});
if (localSttUrl) {
  Object.assign(env, {
    // Nur der eigene Loopback-Mock kann STT empfangen; das Chat-Ziel ist bewusst unbrauchbar.
    SILVIA_LLM_PROVIDER: "compat",
    SILVIA_LLM_BASE_URL: "http://127.0.0.1:1/v1",
    SILVIA_STT_URL: localSttUrl,
  });
}
const artifacts = resolve("artifacts");
await mkdir(artifacts, { recursive: true });
const rawLog = join(artifacts, realLocalTts ? "homepage-greeting-audit-real-local-tts.raw.log" : "homepage-greeting-audit.raw.log");
await appendFile(rawLog, `\n--- ${new Date().toISOString()} ${audit} ---\n`);
let rawWrites = Promise.resolve();
function rawWrite(text) {
  rawWrites = rawWrites.then(() => appendFile(rawLog, text));
  return rawWrites;
}
const owned = [];
function start(file, args, cwd, childEnv = env, label = "app") {
  const child = spawn(file, args, { cwd, env: childEnv, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  for (const [stream, channel] of [[child.stdout, "stdout"], [child.stderr, "stderr"]]) {
    stream.on("data", (chunk) => { void rawWrite(`[${label}:${channel}] ${chunk}`); process[channel === "stdout" ? "stdout" : "stderr"].write(chunk); });
  }
  owned.push(child);
  return child;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      child.removeListener("error", onError);
      resolve(value);
    };
    const onExit = () => finish(true);
    const onError = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

async function waitForPortFree(targetPort) {
  // Windows kann einen entkoppelten Nitro-Kindprozess nach taskkill noch
  // verzögert aus dem Listener entfernen. Bis zu 60 Sekunden abwarten,
  // statt einen nachfolgenden isolierten Audit mit EADDRINUSE abzubrechen.
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const available = await new Promise((resolve) => {
      const server = createServer();
      server.once("error", () => resolve(false));
      server.listen(targetPort, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (available) return;
    await delay(250);
  }
  throw new Error(`Eigener Audit-Port ${targetPort} wurde nicht freigegeben.`);
}

// Windows gibt einen gerade beendeten Listener manchmal erst kurz verzögert frei.
// Vor dem Start des nächsten isolierten Servers deshalb dieselbe belastbare Prüfung
// wie beim Cleanup verwenden, statt bei einer kurzen EADDRINUSE-Spitze abzubrechen.
await waitForPortFree(port);

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    // Nitro kann auf Windows Unterprozesse hinterlassen. Der Audit besitzt nur
    // diese Kinder; daher wird deren Baum vor dem nächsten isolierten Lauf beendet.
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 5_000);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      killer.once("exit", done);
      killer.once("error", done);
    });
    if (await waitForExit(child, 5_000)) return;
  }
  child.kill("SIGTERM");
  const done = await waitForExit(child, 8_000);
  if (done || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGKILL");
  if (!await waitForExit(child, 5_000)) throw new Error("Eigener Audit-Prozess beendet sich nicht.");
}
try {
  if (realLocalTts) {
    const ttsProbe = createServer();
    await new Promise((yes, no) => ttsProbe.once("error", no).listen(ttsPort, "127.0.0.1", yes));
    await new Promise((yes) => ttsProbe.close(yes));
    const ttsEnv = {
      ...env,
      PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", PYTHONPATH: "C:\\Users\\svens\\AppData\\Roaming\\Python\\Python313\\site-packages",
      VOICE_BACKEND: "piper", PIPER_EXE: "C:\\silvia-voice\\.venv-piper\\Scripts\\piper.exe",
      NODE_USE_ENV_PROXY: "0", HTTP_PROXY: "", HTTPS_PROXY: "", ALL_PROXY: "",
    };
    const tts = start("C:\\Python313\\python.exe", ["-m", "uvicorn", "tts_server:app", "--host", "127.0.0.1", "--port", String(ttsPort)], "C:\\silvia-voice", ttsEnv, "piper");
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      assert.equal(tts.exitCode, null, "Lokaler Piper-TTS beendet sich vorzeitig");
      try {
        const response = await fetch(`http://127.0.0.1:${ttsPort}/health`, { signal: AbortSignal.timeout(2_000) });
        const health = await response.json();
        if (response.ok && health?.ok === true && health?.backend === "piper") { ready = true; break; }
      } catch { /* Piper startet noch. */ }
      await new Promise((yes) => setTimeout(yes, 250));
    }
    assert(ready, "Lokaler Piper-TTS auf Port 8184 wurde nicht bereit.");
    Object.assign(env, {
      REAL_LOCAL_TTS: "1",
      // Der App-Server ruft ausschließlich den eben gestarteten Piper-Dienst
      // an. Die unbenutzbare Loopback-Chat-URL erzwingt die lokale Antwort.
      SILVIA_LLM_PROVIDER: "compat",
      SILVIA_LLM_BASE_URL: "http://127.0.0.1:1/v1",
      SILVIA_TTS_URL: `http://127.0.0.1:${ttsPort}/v1/audio/speech`,
      SILVIA_STT_URL: "",
    });
  }
  const server = start(process.execPath, [join(buildRoot, ".output/server/index.mjs")], buildRoot, env, "audit-app");
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    assert.equal(server.exitCode, null, "Testserver vorzeitig beendet");
    try {
      const response = await fetch(env.AUDIT_URL, { signal: AbortSignal.timeout(2000) });
      await response.body?.cancel();
      if (response.ok) { ready = true; break; }
    } catch { /* Server startet noch. */ }
    await new Promise((yes) => setTimeout(yes, 200));
  }
  assert(ready, "Testserver nicht bereit");
  const test = start(process.execPath, [resolve("scripts", audit)], process.cwd(), env, "audit");
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    test.kill();
  }, auditTimeoutMs);
  try {
    const [code] = await once(test, "exit");
    if (timedOut)
      throw new Error(`${audit} überschritt das Zeitfenster von ${auditTimeoutMs / 1000} Sekunden.`);
    process.exitCode = code ?? 1;
  } finally { clearTimeout(timeout); }
} finally {
  for (const child of owned.reverse()) {
    await stop(child);
  }
  await waitForPortFree(port);
  await rawWrites;
}
