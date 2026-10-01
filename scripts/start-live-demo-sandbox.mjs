#!/usr/bin/env node
import { statSync, realpathSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, isAbsolute } from "node:path";
import { isMainModule, projectRoot } from "./with-app-env.mjs";
import { deskProcessEnv } from "./start-desk.mjs";

export const DEFAULT_LIVE_SANDBOX_PORT = 8093;

export function parseLiveSandboxArgs(argv = []) {
  let port = DEFAULT_LIVE_SANDBOX_PORT;
  let confirmed = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--confirm-synthetic") { confirmed = true; continue; }
    if (arg === "--port" || arg.startsWith("--port=")) {
      const raw = arg === "--port" ? argv[++i] : arg.slice(7);
      port = Number.parseInt(String(raw), 10);
      continue;
    }
    throw new Error(`Unbekanntes Argument: ${arg}`);
  }
  if (!confirmed) throw new Error("Start verweigert: --confirm-synthetic ist erforderlich.");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Ungültiger Port (1024–65535).");
  return { port, confirmed };
}

export function liveSandboxConfig({ env = {}, realpath = realpathSync, stat = statSync } = {}) {
  const value = (key) => String(env[key] ?? "").trim();
  const key = value("OPENAI_API_KEY");
  const guard = value("SILVIA_LIVE_GUARD_DIR");
  let guardReady = false;
  try {
    const resolved = isAbsolute(guard) ? realpath(guard) : "";
    const blocked = /(^|[\\/])(?:\.output|temp|tmp)(?:[\\/]|$)/i.test(resolved);
    guardReady = Boolean(resolved) && !blocked && stat(resolved).isDirectory();
  } catch { guardReady = false; }
  return { ok: Boolean(key) && guardReady, hasKey: Boolean(key), guard, guardReady };
}

export function sandboxChildEnv(env, port) {
  return { ...env, SILVIA_DATA_DIR: "memory", DATABASE_URL: "", SILVIA_LIVE_DEMO_ENABLED: "1", SILVIA_LIVE_DEMO_SANDBOX: "1", HOST: "127.0.0.1", PORT: String(port) };
}

export function startLiveSandbox(argv = process.argv.slice(2), { env = process.env, root = projectRoot(), spawnImpl = spawn } = {}) {
  const opts = parseLiveSandboxArgs(argv);
  const mergedEnv = deskProcessEnv(root, env);
  const config = liveSandboxConfig({ env: mergedEnv });
  if (!config.hasKey) throw new Error("Start verweigert: serverseitiger OPENAI_API_KEY fehlt.");
  if (!config.guardReady) throw new Error("Start verweigert: SILVIA_LIVE_GUARD_DIR muss absolut und vorhanden sein.");
  const child = spawnImpl(process.execPath, [join(root, "scripts", "start-desk.mjs"), "--port", String(opts.port)], { cwd: root, env: sandboxChildEnv(mergedEnv, opts.port), stdio: "inherit", windowsHide: true });
  const forward = (signal) => { if (!child.killed) child.kill(signal); };
  process.once("SIGINT", () => forward("SIGINT"));
  process.once("SIGTERM", () => forward("SIGTERM"));
  child.once("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
  return child;
}

if (isMainModule(import.meta.url)) {
  try { startLiveSandbox(); } catch (error) { console.error(`[silvia] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 2; }
}
