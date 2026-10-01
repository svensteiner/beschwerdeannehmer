#!/usr/bin/env node
/**
 * Tagesbetrieb: production Node host without Vite HMR.
 *
 * `npm run dev` hot-reloads `board.ts` / `db.ts` and can open a second PGLite
 * on the same `.silvia-data` (lock). This script serves a Nitro **node-server**
 * build on port 8080 — same URL as the README.
 *
 * Default `vite build` stays Nitro **vercel** (Grok/Vercel). Only this script
 * sets `SILVIA_LOCAL_NITRO=1` so the local listener can SSR. `vite preview`
 * of the vercel output cannot (`ssr_exports`).
 *
 * `npm start` reads `.env` next to the project (OPENAI_API_KEY, DATABASE_URL).
 * Own process env wins. `VITE_*` keys that look like secrets are skipped.
 *
 * `npm start` rebuilds when git HEAD, tracked local source changes (or source mtime) are newer than
 * `.output/silvia-src.stamp` — so `git pull` then `npm start` is enough.
 *
 * Usage: `npm start` · `node scripts/start-desk.mjs --port 8090`
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createConnection } from "node:net";
import { delimiter, join } from "node:path";
import {
  exitStatusFromChild,
  isMainModule,
  projectRoot,
} from "./with-app-env.mjs";
import { isViteSecretKey } from "./vite-env-safety.mjs";
import { assertSupportedProductionNode } from "./node-runtime.mjs";
import {
  copyPgliteAssets,
  pgliteAssetSources,
  PGLITE_ASSET_NAMES,
} from "./pglite-assets.mjs";
export { copyPgliteAssets, pgliteAssetSources, PGLITE_ASSET_NAMES };

export const DEFAULT_START_PORT = 8080;
// Default bind stays loopback-only; set HOST=0.0.0.0 explicitly to listen on
// all interfaces (e.g. to reach the desk from another device on the LAN).
export const DEFAULT_START_HOST = "127.0.0.1";
export const START_MODE = "node-server";
export const LOCAL_NITRO_ENV = "SILVIA_LOCAL_NITRO";
export const LOCAL_SERVER_REL = join(".output", "server", "index.mjs");
export const SRC_STAMP_REL = join(".output", "silvia-src.stamp");
export const DESK_ENV_REL = ".env";

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export { isViteSecretKey } from "./vite-env-safety.mjs";

export function parseStartArgs(argv = [], env = {}) {
  let port = Number.parseInt(String(env.PORT || ""), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) port = DEFAULT_START_PORT;
  let host = String(env.HOST || "").trim() || DEFAULT_START_HOST;
  let skipBuild = false;
  let forceBuild = false;
  let anzeige = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port" || arg.startsWith("--port=")) {
      const raw = arg === "--port" ? argv[++i] : arg.slice("--port=".length);
      port = Number.parseInt(String(raw), 10);
    } else if (arg === "--host" || arg.startsWith("--host=")) {
      host = arg === "--host" ? String(argv[++i] ?? "") : arg.slice("--host=".length);
      host = host.trim();
    } else if (arg === "--skip-build") {
      skipBuild = true;
    } else if (arg === "--build") {
      forceBuild = true;
    } else if (arg === "--anzeige") {
      anzeige = true;
    }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid port: ${port}`);
  }
  if (!host) throw new Error("invalid host");
  return { port, host, skipBuild, forceBuild, anzeige };
}

export function isLoopbackHost(host) {
  const value = String(host ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

/**
 * Practice data must not travel over a plain HTTP LAN connection. A deliberately
 * transient RAM-only demo remains possible for a local product presentation.
 */
export function lanStartSafety({ host, env = {} }) {
  if (isLoopbackHost(host)) return { ok: true, mode: "loopback" };
  const ramOnly = String(env.SILVIA_DATA_DIR ?? "").trim().toLowerCase() === "memory" &&
    !String(env.DATABASE_URL ?? "").trim();
  const testOptIn = String(env.SILVIA_ALLOW_INSECURE_LAN_TEST ?? "").trim() === "1";
  return ramOnly && testOptIn
    ? { ok: true, mode: "ram-demo" }
    : { ok: false, mode: "blocked" };
}

export function lanStartBlockedMessage() {
  return "Direkter LAN-Start über HTTP ist für Praxisdaten gesperrt. Für den Betrieb Silvia auf 127.0.0.1 lassen und einen HTTPS-Reverse-Proxy davor setzen. Nur eine RAM-Demo darf mit SILVIA_DATA_DIR=memory und SILVIA_ALLOW_INSECURE_LAN_TEST=1 bewusst ins LAN.";
}

export function localServerRel() {
  return LOCAL_SERVER_REL;
}

export function productionBuildReady(root, exists = existsSync) {
  return exists(join(root, LOCAL_SERVER_REL));
}

export function shouldBuildFirst({ forceBuild, skipBuild, hasBuild, stale, missingTafelRoutes }) {
  if (skipBuild) return false;
  if (forceBuild) return true;
  if (!hasBuild) return true;
  if (missingTafelRoutes) return true;
  return Boolean(stale);
}

export function missingBuildMessage() {
  return "Kein Build. Erst npm start (baut lokal) oder npm start -- --build.";
}

/** Daily PC must be able to sichern / holen / wait — old Aug builds omit these routes. */
export const TAFEL_START_ROUTES = ["/api/tafel-backup", "/api/tafel-holen", "/holen-warten"];

/** Phone gateway — old builds omit these; npm start must rebuild. */
export const STIMME_START_ROUTES = ["/api/stimme/hoeren", "/api/stimme/sprechen"];

export const REQUIRED_START_ROUTES = [...TAFEL_START_ROUTES, ...STIMME_START_ROUTES];

export function deskServerHasTafelRoutes(source) {
  const text = String(source ?? "");
  return TAFEL_START_ROUTES.every((route) => text.includes(route));
}

export function deskServerHasStimmeRoutes(source) {
  const text = String(source ?? "");
  return STIMME_START_ROUTES.every((route) => text.includes(route));
}

export function deskServerHasRequiredRoutes(source) {
  return deskServerHasTafelRoutes(source) && deskServerHasStimmeRoutes(source);
}

export function missingTafelRoutesMessage() {
  return "Dieser Build hat Tafel sichern/holen nicht. npm start ohne --skip-build (baut neu).";
}

export function missingStimmeRoutesMessage() {
  return "Dieser Build hat Stimme hören/sprechen nicht. npm start ohne --skip-build (baut neu).";
}

export function missingRequiredRoutesMessage(source) {
  const text = String(source ?? "");
  if (!deskServerHasTafelRoutes(text)) return missingTafelRoutesMessage();
  if (!deskServerHasStimmeRoutes(text)) return missingStimmeRoutesMessage();
  return missingTafelRoutesMessage();
}

export function readDeskServerSource(root, { readFile = readFileSync } = {}) {
  try {
    return String(readFile(join(root, LOCAL_SERVER_REL), "utf8"));
  } catch {
    return "";
  }
}

export function deskOutputMissingTafelRoutes(root, io = {}) {
  const exists = io.exists ?? existsSync;
  if (!productionBuildReady(root, exists)) return true;
  return !deskServerHasRequiredRoutes(readDeskServerSource(root, io));
}

export function staleBuildMessage() {
  return "Quelltext neuer als Build (git pull oder lokale Änderung). Baue neu — danach startet die Tafel.";
}

export function parseGitHead(stdout) {
  const out = String(stdout ?? "").trim();
  return /^[0-9a-f]{7,40}$/i.test(out) ? out : "";
}

export function gitHead(root, execFile = execFileSync) {
  try {
    return parseGitHead(
      execFile("git", ["-C", root, "rev-parse", "HEAD"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return "";
  }
}

/**
 * Hash tracked, staged and unstaged changes without looking at untracked
 * runtime data such as `.silvia-data`. `git diff HEAD` intentionally includes
 * the index as well as the working tree.
 */
export function gitWorktreeFingerprint(root, execFile = execFileSync) {
  try {
    const diff = execFile("git", ["-C", root, "diff", "--binary", "HEAD", "--"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 8 * 1024 * 1024,
    });
    const text = String(diff ?? "");
    return text ? createHash("sha256").update(text).digest("hex") : "";
  } catch {
    return null;
  }
}

const SOURCE_STAMP_PATHS = ["src", "scripts", "migrations", "package.json", "vite.config.ts"];
const SOURCE_STAMP_SKIP = new Set(["node_modules", ".output", ".git", ".silvia-data", "dist"]);

export function newestSourceMtime(root, { stat = statSync, readdir = readdirSync } = {}) {
  let max = 0;
  const stack = SOURCE_STAMP_PATHS.map((rel) => join(root, rel));
  while (stack.length) {
    const path = stack.pop();
    let st;
    try {
      st = stat(path);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      let names = [];
      try {
        names = readdir(path);
      } catch {
        continue;
      }
      for (const name of names) {
        if (SOURCE_STAMP_SKIP.has(name)) continue;
        stack.push(join(path, name));
      }
    } else if (st.isFile()) {
      const t = Number(st.mtimeMs) || 0;
      if (t > max) max = t;
    }
  }
  return max;
}

export function sourceFingerprint(root, io = {}) {
  const head = Object.prototype.hasOwnProperty.call(io, "gitHead") ? io.gitHead : gitHead(root, io.execFile);
  if (head) {
    const worktree = Object.prototype.hasOwnProperty.call(io, "gitWorktreeFingerprint")
      ? io.gitWorktreeFingerprint
      : gitWorktreeFingerprint(root, io.execFile);
    if (worktree) return `git:${head}:worktree:${worktree}`;
    if (worktree === "") return `git:${head}`;
    const t = newestSourceMtime(root, io);
    return t ? `git:${head}:mtime:${Math.floor(t)}` : `git:${head}`;
  }
  const t = newestSourceMtime(root, io);
  return t ? `mtime:${Math.floor(t)}` : "";
}

export function readBuildStamp(root, { readFile = readFileSync } = {}) {
  try {
    return String(readFile(join(root, SRC_STAMP_REL), "utf8")).trim();
  } catch {
    return "";
  }
}

export function writeBuildStamp(root, rev, { writeFile = writeFileSync } = {}) {
  const stamp = String(rev ?? "").trim();
  if (!stamp) return "";
  writeFile(join(root, SRC_STAMP_REL), `${stamp}\n`);
  return stamp;
}

export function buildIsStale({ hasBuild, sourceRev, buildRev }) {
  if (!hasBuild) return false;
  if (!sourceRev) return false;
  return sourceRev !== String(buildRev ?? "");
}

export function startListenUrl({ host, port }) {
  const shown = host === "0.0.0.0" || host === "::" ? "localhost" : host;
  return `http://${shown}:${port}`;
}

export function startBanner({ host, port }) {
  const url = startListenUrl({ host, port });
  return [
    `[silvia] Tagesbetrieb ohne HMR — ${url}`,
    `[silvia] Tafel ${url}/app · Anmelden ${url}/login · Startseite ist die Huber-Demo.`,
    "[silvia] Tafel bleibt in .silvia-data. Nicht npm run dev währenddessen (HMR kann sperren).",
    "[silvia] Zweiter Start: npm start -- --port 8081 wird Anzeige, wenn die Tafel schon offen ist.",
  ].join("\n");
}

export function portBusyStaleMessage() {
  return "Der laufende Stand ist älter als git pull — Prozess beenden und npm start neu.";
}

export function portBusyMessage({ host, port, stale }) {
  const url = startListenUrl({ host, port });
  const restart = stale ? ` ${portBusyStaleMessage()}` : "";
  return `Port ${port} ist schon belegt. Silvia läuft vermutlich schon — Tafel ${url}/app im Browser.${restart} Zweiten Rechner: npm start -- --port 8081 (Anzeige). Den Schreib-Prozess nur beenden, wenn die Tafel wirklich zu soll.`;
}

export function probeHost(host) {
  return host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
}

/** True when something already accepts TCP on this listen address. */
export function probePort({ host, port }, connect = createConnection) {
  const probe = probeHost(host);
  return new Promise((resolve) => {
    const socket = connect({ host: probe, port });
    const done = (taken) => {
      socket.removeAllListeners();
      try {
        socket.destroy();
      } catch {
        /* closed */
      }
      resolve(taken);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

export async function assertPortFree(opts) {
  if (await probePort(opts)) {
    throw new Error(portBusyMessage(opts));
  }
}

export function parseDeskEnvValue(raw) {
  const trimmed = String(raw ?? "").trim();
  if (trimmed.length >= 2) {
    const quote = trimmed[0];
    if ((quote === '"' || quote === "'") && trimmed[trimmed.length - 1] === quote) {
      const inner = trimmed.slice(1, -1);
      if (quote === "'") return inner;
      return inner
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
  }
  return trimmed;
}

/** KEY=VALUE lines. `#` comments, optional `export `, quotes. No `$VAR` expansion. */
export function parseDeskEnvFile(text) {
  const out = {};
  const src = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  for (const rawLine of src.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const stripped = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eq = stripped.indexOf("=");
    if (eq <= 0) continue;
    const key = stripped.slice(0, eq).trim();
    if (!ENV_KEY_RE.test(key) || isViteSecretKey(key)) continue;
    out[key] = parseDeskEnvValue(stripped.slice(eq + 1));
  }
  return out;
}

/** Own `process.env` keys win over the file. Vite secrets from the file stay out. */
export function mergeDeskEnv(fileEnv, processEnv) {
  const out = {};
  for (const [key, value] of Object.entries(fileEnv ?? {})) {
    if (!ENV_KEY_RE.test(key) || isViteSecretKey(key) || typeof value !== "string") continue;
    out[key] = value;
  }
  for (const key of Object.keys(processEnv ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(processEnv, key)) continue;
    const value = processEnv[key];
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export function loadDeskEnvFile(root, { readFile = readFileSync, exists = existsSync } = {}) {
  const file = join(root, DESK_ENV_REL);
  if (!exists(file)) return {};
  return parseDeskEnvFile(readFile(file, "utf8"));
}

export function deskEnvFileExists(root, exists = existsSync) {
  return exists(join(root, DESK_ENV_REL));
}

export function deskProcessEnv(root, processEnv = process.env) {
  return mergeDeskEnv(loadDeskEnvFile(root), processEnv);
}

export function deskEnvLoadedMessage() {
  return "[silvia] .env gelesen";
}

/** npm lifecycle scripts already have this; a raw `node scripts/start-desk.mjs` does not. */
export function withLocalBin(root, env = process.env) {
  const bin = join(root, "node_modules", ".bin");
  const prev = env.PATH || env.Path || "";
  if (prev.split(delimiter).includes(bin)) return { ...env, PATH: prev };
  return { ...env, PATH: `${bin}${delimiter}${prev}` };
}

export function startBuildEnv(root, env = process.env) {
  return { ...withLocalBin(root, deskProcessEnv(root, env)), [LOCAL_NITRO_ENV]: "1" };
}

export const BUILD_STAMP_ENV = "SILVIA_BUILD_STAMP";

export function startServerEnv(root, { host, port, anzeige, buildStamp }, env = process.env) {
  const merged = deskProcessEnv(root, env);
  const stamp = String(buildStamp ?? "").trim();
  return {
    ...withLocalBin(root, merged),
    PORT: String(port),
    HOST: host,
    NITRO_PORT: String(port),
    NITRO_HOST: host,
    ...(anzeige ? { SILVIA_ANZEIGE: "1" } : {}),
    ...(stamp ? { [BUILD_STAMP_ENV]: stamp } : {}),
  };
}

function runChild(command, args, root, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd: root,
      env: env ?? withLocalBin(root),
    });
    const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
    const forward = (signal) => {
      try {
        child.kill(signal);
      } catch {
        /* already exited */
      }
    };
    for (const signal of signals) process.on(signal, forward);
    const drop = () => {
      for (const signal of signals) process.off(signal, forward);
    };
    child.on("error", (err) => {
      drop();
      reject(err);
    });
    child.on("exit", (code, signal) => {
      drop();
      resolve(exitStatusFromChild(code, signal));
    });
  });
}

export function buildArgv(root) {
  return [join(root, "scripts", "build-local-node-server.mjs")];
}

export function localServerArgv(root) {
  return [join(root, LOCAL_SERVER_REL)];
}

export function migrateArgv(root) {
  return [join(root, "scripts", "migrate.mjs")];
}

async function main(argv) {
  assertSupportedProductionNode();
  const root = projectRoot();
  const env = deskProcessEnv(root);
  const opts = parseStartArgs(argv, env);
  if (!lanStartSafety({ host: opts.host, env }).ok) {
    console.error(`[silvia] ${lanStartBlockedMessage()}`);
    process.exit(2);
  }
  if (deskEnvFileExists(root)) {
    console.info(deskEnvLoadedMessage());
  }
  const hasBuild = productionBuildReady(root);
  const sourceRev = sourceFingerprint(root);
  const buildRev = readBuildStamp(root);
  const stale = buildIsStale({ hasBuild, sourceRev, buildRev });
  const missingTafelRoutes = deskOutputMissingTafelRoutes(root);
  if (shouldBuildFirst({ ...opts, hasBuild, stale, missingTafelRoutes })) {
    console.info(
      stale
        ? `[silvia] ${staleBuildMessage()}`
        : missingTafelRoutes
          ? `[silvia] ${missingRequiredRoutesMessage(readDeskServerSource(root))}`
          : "[silvia] Baue zuerst (node-server, ohne HMR)…",
    );
    const buildCode = await runChild(process.execPath, buildArgv(root), root, startBuildEnv(root, env));
    if (buildCode !== 0) process.exit(buildCode);
    // build-local-node-server.mjs runs the migration as part of the same
    // build transaction (and hydrates the PGlite runtime assets).
    writeBuildStamp(root, sourceFingerprint(root));
  } else if (!hasBuild) {
    console.error(missingBuildMessage());
    process.exit(2);
  }
  if (deskOutputMissingTafelRoutes(root)) {
    console.error(`[silvia] ${missingRequiredRoutesMessage(readDeskServerSource(root))}`);
    process.exit(2);
  }
  const assets = copyPgliteAssets(root);
  console.info(`[silvia] PGLite WASM: ${assets.join(", ")}`);
  console.info(startBanner(opts));
  try {
    await assertPortFree({ ...opts, stale });
  } catch (err) {
    console.error(`[silvia] ${err?.message || err}`);
    process.exit(1);
  }
  const stamp = readBuildStamp(root) || sourceFingerprint(root);
  const code = await runChild(
    process.execPath,
    localServerArgv(root),
    root,
    startServerEnv(root, { ...opts, buildStamp: stamp }, env),
  );
  process.exit(code);
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error("[silvia] start failed:", err?.message || err);
    process.exit(1);
  });
}
