#!/usr/bin/env node
/**
 * Erstellt einen isolierten, aus gefilterten Quell-Dateien aufgebauten Arbeitsordner für
 * den späteren Homepage-/Gesprächs-Audit. Standardmäßig wird nur vorbereitet;
 * `build` baut ausschließlich in diesem Tempordner; `homepage` führt die
 * freigegebenen Homepage-Audits darin aus und entfernt die Kopie danach.
 *
 * Bewusst ausgeschlossen: .env*, .grok, .output, .silvia-data, Backups,
 * Claude-/Agentdaten und alle nicht für den Build benötigten Audit-Skripte.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm, stat, symlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { assertSupportedProductionNode } from "./node-runtime.mjs";

// Ein Audit unter einer nicht unterstützten Laufzeit ist kein Produktionsnachweis.
assertSupportedProductionNode();
const sourceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mode = process.argv[2] ?? "prepare";
assert(["prepare", "build", "homepage", "privacy", "auth-speech", "appointment", "backup-restore", "release-gate", "onboarding", "production", "phone-gateway"].includes(mode), "Aufruf: node scripts/isolated-home-audit.mjs [prepare|build|homepage|privacy|auth-speech|appointment|backup-restore|release-gate|onboarding|production|phone-gateway]");

const requiredFiles = new Set([
  "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts",
  "playwright.config.ts", "playwright.release-gate.config.ts",
]);
const requiredPrefixes = ["src/", "migrations/", "public/", "server/"];
const requiredExact = new Set([
  "scripts/node-runtime.mjs",
  "scripts/vite-env-safety.mjs",
  "scripts/client-bundle-audit.mjs",
  "scripts/pglite-assets.mjs",
  "scripts/app-env-plugin.mjs", "scripts/build-local-node-server.mjs",
  "scripts/build-asset-integrity.mjs",
  "scripts/grok-pwa-plugin.mjs", "scripts/grok-pwa-shared.mjs", "scripts/install-page.html",
  "scripts/migration-plan.mjs",
  "scripts/migrate.mjs", "scripts/with-app-env.mjs", "scripts/release-gate-server.mjs",
  "scripts/production-smoke-audit.mjs",
  "scripts/phone-gateway-production-e2e.mjs",
  "scripts/run-homepage-audit.mjs", "scripts/homepage-acceptance-audit.mjs", "scripts/homepage-controls-audit.mjs",
  "scripts/homepage-link-click-audit.mjs",
  "scripts/homepage-audio-error-audit.mjs", "scripts/homepage-greeting-audit.mjs",
  "scripts/homepage-cta-immediate-audit.mjs",
  "scripts/homepage-call-teardown-audit.mjs", "scripts/homepage-barge-audit.mjs",
  "scripts/homepage-knowledge-management-audit.mjs", "scripts/homepage-training-capacity-audit.mjs",
  "scripts/homepage-negation-audit.mjs",
  "scripts/homepage-product-film-audit.mjs", "scripts/training-retry-audit.mjs",
  "scripts/auth-speech-retry-audit.mjs",
  "scripts/live-demo-audit.mjs",
  "scripts/privacy-demo-flag-audit.mjs", "scripts/privacy-practice-facts-audit.mjs",
  "scripts/privacy-practice-stt-audit.mjs", "scripts/run-privacy-practice-facts-audit.mjs",
  "scripts/appointment-date-audit.mjs",
  "scripts/backup-restore-audit.mjs", "scripts/backup-restore-subprocess.mjs",
  "scripts/onboarding-registration-audit.mjs",
  "tests/e2e/release-gate.spec.ts",
]);
const forbidden = /(^|\/)(\.env(?:\.|$)|\.grok|\.output|\.silvia-data|\.claude|artifacts|backups?|_e2e)(\/|$)|(^|\/)(?:\.env[^/]*|.*\.(?:bak|sqlite|db|FDB))$/i;
const homepageAudits = [
  "homepage-acceptance-audit.mjs",
  "homepage-controls-audit.mjs",
  "homepage-link-click-audit.mjs",
  "homepage-audio-error-audit.mjs",
  "homepage-cta-immediate-audit.mjs",
  "homepage-product-film-audit.mjs",
  "homepage-greeting-audit.mjs",
  "training-retry-audit.mjs",
  "homepage-knowledge-management-audit.mjs",
  "homepage-training-capacity-audit.mjs",
  "homepage-negation-audit.mjs",
  "homepage-call-teardown-audit.mjs",
  "homepage-barge-audit.mjs",
  "live-demo-audit.mjs",
];
const localNodeModuleDirs = new Set([".cache", ".nitro", ".vite", ".vite-temp"]);

/**
 * Vite and Nitro write their build scratch data below `node_modules`. A single
 * junction to the workspace would make an isolated audit alter that shared
 * dependency tree (and fails under Windows locks). Link packages individually,
 * but keep the known scratch folders as ordinary directories in the temp copy.
 */
async function linkDependencyOverlay(tempRoot) {
  const sourceModules = join(sourceRoot, "node_modules");
  const modules = join(tempRoot, "node_modules");
  await mkdir(modules, { recursive: true });
  for (const entry of await readdir(sourceModules, { withFileTypes: true })) {
    if (localNodeModuleDirs.has(entry.name)) continue;
    const source = join(sourceModules, entry.name);
    const target = join(modules, entry.name);
    if (entry.isDirectory()) {
      await symlink(source, target, "junction");
    } else if (entry.isFile()) {
      await copyFile(source, target);
    } else {
      throw new Error(`Unerwarteter Abhängigkeits-Eintrag: ${entry.name}`);
    }
  }
}

function trackedFiles() {
  const raw = execFileSync("git", ["-C", sourceRoot, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "buffer" });
  return raw.toString("utf8").split("\0").filter(Boolean).filter((name) => {
    const normalized = name.replaceAll("\\", "/");
    if (forbidden.test(normalized)) return false;
    return requiredFiles.has(normalized) || requiredExact.has(normalized) || requiredPrefixes.some((prefix) => normalized.startsWith(prefix));
  });
}

async function copyTracked(tempRoot, files) {
  for (const file of files) {
    const from = join(sourceRoot, file);
    const sourceReal = await realpath(from);
    const sourceStat = await lstat(from);
    assert(sourceStat.isFile(), `Quelle ist keine reguläre Datei: ${file}`);
    assert(sourceReal === sourceRoot || sourceReal.startsWith(`${sourceRoot}${sep}`), `Quelle außerhalb Workspace: ${file}`);
    const parentReal = await realpath(dirname(from));
    assert(parentReal === sourceRoot || parentReal.startsWith(`${sourceRoot}${sep}`), `Quellordner außerhalb Workspace: ${file}`);
    const to = join(tempRoot, file);
    assert(resolve(to).startsWith(`${resolve(tempRoot)}${sep}`), `Ziel außerhalb Tempordner: ${file}`);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
  }
}

async function originalOutputSnapshot() {
  const output = join(sourceRoot, ".output");
  try {
    const info = await stat(output);
    assert(info.isDirectory(), ".output ist kein Ordner");
    const index = join(output, "server", "index.mjs");
    const bytes = await readFile(index);
    const files = [];
    async function walk(dir) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else {
          assert(entry.isFile(), `Unerwarteter .output-Eintrag: ${relativeOutput(path)}`);
          const info = await stat(path);
          files.push({ path: relativeOutput(path), size: info.size, mtimeMs: info.mtimeMs });
        }
      }
    }
    const relativeOutput = (path) => path.slice(output.length + 1).replaceAll("\\", "/");
    await walk(output);
    files.sort((a, b) => a.path.localeCompare(b.path));
    return { files, indexSha256: createHash("sha256").update(bytes).digest("hex") };
  } catch (error) {
    if (error?.code === "ENOENT") return { absent: true };
    throw error;
  }
}

function sanitizedEnv(tempRoot) {
  const names = ["PATH", "SystemRoot", "ComSpec", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "ProgramData"];
  const env = Object.fromEntries(names.filter((name) => typeof process.env[name] === "string").map((name) => [name, process.env[name]]));
  Object.assign(env, {
    PATH: `${join(tempRoot, "node_modules", ".bin")}${delimiter}${process.env.PATH ?? ""}`,
    HOST: "127.0.0.1", PORT: "8094", VITE_AUTH_ENABLED: "false",
    SILVIA_LOCAL_NITRO: "1", SILVIA_DATA_DIR: "memory", DATABASE_URL: "",
    OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", KIMI_API_KEY: "", GEMINI_API_KEY: "",
    SILVIA_LLM_BASE_URL: "", SILVIA_LLM_PROVIDER: "local", SILVIA_LIVE_DEMO_ENABLED: "0", SILVIA_BOOKING: "",
    SILVIA_SOURCE_ROOT: tempRoot,
    SILVIA_PHONE_ROOT: process.env.SILVIA_PHONE_ROOT || join(sourceRoot, "..", "silvia-phone"),
    SILVIA_PYTHON: process.env.SILVIA_PYTHON || process.env.PYTHON || "python",
    NODE_USE_ENV_PROXY: "0", HTTP_PROXY: "", HTTPS_PROXY: "", ALL_PROXY: "",
    npm_config_user_config: join(tempRoot, "missing-npmrc"),
  });
  return env;
}

const original = await originalOutputSnapshot();
const tempRoot = await (await import("node:fs/promises")).mkdtemp(join(tmpdir(), "silvia-home-audit-"));
let buildExit = null;
let files = [];
let auditResults = [];
try {
  files = trackedFiles();
  assert(files.length > 0, "Keine freigegebenen Git-Dateien gefunden");
  await copyTracked(tempRoot, files);
  await linkDependencyOverlay(tempRoot);
  assert(isAbsolute(tempRoot) && resolve(process.cwd()) !== tempRoot, "Unsicherer Temp-CWD");
  assert((await stat(join(tempRoot, "package.json"))).isFile(), "package.json fehlt im Tempordner");
  assert(!files.some((file) => forbidden.test(file.replaceAll("\\", "/"))), "Verbotene Datei ausgewählt");
  if (mode === "build" || mode === "homepage" || mode === "privacy" || mode === "onboarding" || mode === "production" || mode === "phone-gateway") {
    const child = spawnSync(process.execPath, [join(tempRoot, "scripts", "build-local-node-server.mjs")], {
      cwd: tempRoot, env: sanitizedEnv(tempRoot), stdio: "inherit", windowsHide: true,
    });
    buildExit = child.error ? 1 : (child.status ?? 1);
    assert.equal(buildExit, 0, `isolierter Build fehlgeschlagen: ${buildExit}`);
    assert((await stat(join(tempRoot, ".output", "server", "index.mjs")).catch(() => null))?.isFile(), "Temp-Build erzeugte keinen Server");
    const bundleAudit = spawnSync(process.execPath, [
      join(tempRoot, "scripts", "client-bundle-audit.mjs"),
      "--client-dir", join(tempRoot, ".output", "public"),
      "--ssr-dir", join(tempRoot, ".output", "server"),
    ], { cwd: tempRoot, env: sanitizedEnv(tempRoot), stdio: "inherit", windowsHide: true });
    const bundleAuditExit = bundleAudit.error ? 1 : (bundleAudit.status ?? 1);
    assert.equal(bundleAuditExit, 0, `Client-Bundle-Audit fehlgeschlagen: ${bundleAuditExit}`);
    auditResults.push({ audit: "client-bundle-audit.mjs", exit: bundleAuditExit });
  }
  if (mode === "homepage") {
    for (const audit of homepageAudits) {
      const child = spawnSync(process.execPath, [join(tempRoot, "scripts", "run-homepage-audit.mjs"), tempRoot, audit], {
        cwd: tempRoot, env: sanitizedEnv(tempRoot), stdio: "inherit", windowsHide: true,
      });
      const exit = child.error ? 1 : (child.status ?? 1);
      assert.equal(exit, 0, `${audit} fehlgeschlagen: ${exit}`);
      auditResults.push({ audit, exit });
    }
  }
  if (mode === "privacy") {
    const audits = [
      ["privacy-demo-flag-audit.mjs", "scripts/run-homepage-audit.mjs"],
      ["privacy-practice-facts-audit.mjs", "scripts/run-privacy-practice-facts-audit.mjs"],
      ["privacy-practice-stt-audit.mjs", "scripts/run-privacy-practice-facts-audit.mjs"],
    ];
    for (const [audit, runner] of audits) {
      const child = spawnSync(process.execPath, [join(tempRoot, runner), tempRoot, audit], {
        cwd: tempRoot, env: sanitizedEnv(tempRoot), stdio: "inherit", windowsHide: true,
      });
      const exit = child.error ? 1 : (child.status ?? 1);
      assert.equal(exit, 0, `${audit} fehlgeschlagen: ${exit}`);
      auditResults.push({ audit, exit });
    }
  }
  if (mode === "auth-speech") {
    const child = spawnSync(process.execPath, [join(tempRoot, "scripts", "auth-speech-retry-audit.mjs")], {
      cwd: tempRoot, env: sanitizedEnv(tempRoot), stdio: "inherit", windowsHide: true,
    });
    const exit = child.error ? 1 : (child.status ?? 1);
    assert.equal(exit, 0, `auth-speech-retry-audit.mjs fehlgeschlagen: ${exit}`);
    auditResults.push({ audit: "auth-speech-retry-audit.mjs", exit });
  }
  if (mode === "appointment") {
    const child = spawnSync(process.execPath, [join(tempRoot, "scripts", "appointment-date-audit.mjs"), tempRoot], {
      cwd: tempRoot, env: sanitizedEnv(tempRoot), stdio: "inherit", windowsHide: true,
    });
    const exit = child.error ? 1 : (child.status ?? 1);
    assert.equal(exit, 0, "isolierter Termin-Gesprächsaudit fehlgeschlagen");
    auditResults.push({ audit: "appointment-date-audit.mjs", exit });
  }
  if (mode === "backup-restore") {
    const child = spawnSync(process.execPath, ["--import", "tsx", join(tempRoot, "scripts", "backup-restore-audit.mjs")], {
      cwd: tempRoot, env: sanitizedEnv(tempRoot), stdio: "inherit", windowsHide: true,
    });
    const exit = child.error ? 1 : (child.status ?? 1);
    assert.equal(exit, 0, "isolierter Sicherungs- und Wiederherstellungs-Audit fehlgeschlagen");
    auditResults.push({ audit: "backup-restore-audit.mjs", exit });
  }
  if (mode === "release-gate") {
    const child = spawnSync(process.execPath, [
      join(tempRoot, "node_modules", "playwright", "cli.js"),
      "test", "--config=playwright.release-gate.config.ts",
    ], {
      cwd: tempRoot, env: sanitizedEnv(tempRoot), stdio: "inherit", windowsHide: true,
    });
    const exit = child.error ? 1 : (child.status ?? 1);
    assert.equal(exit, 0, "isolierter Browser-Release-Gate fehlgeschlagen");
    auditResults.push({ audit: "release-gate.spec.ts", exit });
  }
  if (mode === "onboarding") {
    const child = spawnSync(process.execPath, [join(tempRoot, "scripts", "onboarding-registration-audit.mjs")], {
      cwd: tempRoot, env: sanitizedEnv(tempRoot), stdio: "inherit", windowsHide: true,
    });
    const exit = child.error ? 1 : (child.status ?? 1);
    assert.equal(exit, 0, "isolierter Onboarding-Registrierungs-Audit fehlgeschlagen");
    auditResults.push({ audit: "onboarding-registration-audit.mjs", exit });
  }
  if (mode === "production") {
    const child = spawnSync(process.execPath, [join(tempRoot, "scripts", "production-smoke-audit.mjs")], {
      cwd: tempRoot,
      env: { ...sanitizedEnv(tempRoot), SPEECH_BODY_AUDIT: "1", FILM_AUDIO_AUDIT: "1" },
      stdio: "inherit",
      windowsHide: true,
    });
    const exit = child.error ? 1 : (child.status ?? 1);
    assert.equal(exit, 0, "isolierter Produktions-Sicherheitsaudit fehlgeschlagen");
    auditResults.push({ audit: "production-smoke-audit.mjs", exit });
  }
  if (mode === "phone-gateway") {
    const child = spawnSync(process.execPath, [join(tempRoot, "scripts", "phone-gateway-production-e2e.mjs")], {
      cwd: tempRoot, env: sanitizedEnv(tempRoot), stdio: "inherit", windowsHide: true,
    });
    const exit = child.error ? 1 : (child.status ?? 1);
    assert.equal(exit, 0, "isolierter Telefon-Gateway-Produktions-E2E-Test fehlgeschlagen");
    auditResults.push({ audit: "phone-gateway-production-e2e.mjs", exit });
  }
} finally {
  try {
    const after = await originalOutputSnapshot();
    assert.deepEqual(after, original, "Original-.output wurde verändert");
  } finally {
    if (["homepage", "privacy", "auth-speech", "appointment", "backup-restore", "release-gate", "onboarding", "production", "phone-gateway"].includes(mode)) await rm(tempRoot, { recursive: true, force: true });
  }
}
console.log(JSON.stringify({ ok: true, mode, ...(["homepage", "privacy", "auth-speech", "appointment", "backup-restore", "release-gate", "onboarding", "production", "phone-gateway"].includes(mode) ? { audits: auditResults, tempRootRemoved: true } : { tempRoot }), trackedFiles: files.length, buildExit, originalOutputUnchanged: true }, null, 2));
