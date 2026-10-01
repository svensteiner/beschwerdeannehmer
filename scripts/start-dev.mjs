#!/usr/bin/env node
/**
 * Safe local development server. Like `npm start`, persistent practice data
 * never listens on plain HTTP outside the own computer.
 */
import { spawn } from "node:child_process";
import {
  deskProcessEnv,
  lanStartBlockedMessage,
  lanStartSafety,
  parseStartArgs,
  withLocalBin,
} from "./start-desk.mjs";
import { exitStatusFromChild, isMainModule, projectRoot } from "./with-app-env.mjs";

export function devStartOptions(argv = [], env = {}) {
  const { host, port } = parseStartArgs(argv, env);
  return { host, port };
}

export function viteDevArgv(argv, { host, port }) {
  const passthrough = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--host" || arg === "--port") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--host=") || arg.startsWith("--port=")) continue;
    passthrough.push(arg);
  }
  return ["scripts/with-app-env.mjs", "vite", "dev", "--host", host, "--port", String(port), ...passthrough];
}

export async function main(argv) {
  const root = projectRoot();
  const env = deskProcessEnv(root);
  const options = devStartOptions(argv, env);
  if (!lanStartSafety({ host: options.host, env }).ok) {
    console.error(`[silvia] ${lanStartBlockedMessage()}`);
    process.exit(2);
  }
  const child = spawn(process.execPath, viteDevArgv(argv, options), {
    cwd: root,
    env: withLocalBin(root, env),
    stdio: "inherit",
    windowsHide: true,
  });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", (error) => {
    console.error(`[silvia] Entwicklungsstart fehlgeschlagen: ${error.message}`);
    process.exit(127);
  });
  child.on("exit", (code, signal) => process.exit(exitStatusFromChild(code, signal)));
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[silvia] Entwicklungsstart fehlgeschlagen: ${error?.message || error}`);
    process.exit(1);
  });
}
