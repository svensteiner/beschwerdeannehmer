#!/usr/bin/env node
/**
 * Build script for local node-server production mode.
 *
 * Before this change, `npm run build` with `SILVIA_LOCAL_NITRO=1` produced
 * .output/server/index.mjs but not all required PGLite runtime assets for local
 * execution, forcing a manual copy step. This script keeps the existing wrapper
 * behavior for Vite/build but appends deterministic asset hydration for the
 * node-server runtime.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { projectRoot, mergeAppEnv, readAppEnv } from "./with-app-env.mjs";
import { missingAssetRefs } from "./build-asset-integrity.mjs";
import { copyPgliteAssets } from "./pglite-assets.mjs";

const root = projectRoot();
const PUBLIC_ASSET_DIR = join(root, ".output", "public", "assets");
const SERVER_DIR = join(root, ".output", "server");

function runNode(script, args, { env = process.env, cwd = root } = {}) {
  const child = spawnSync(process.execPath, [script, ...args], {
    cwd,
    env,
    stdio: "inherit",
  });
  if (child.error) {
    throw child.error;
  }
  if (child.status !== 0) {
    const signal = child.signal === "SIGINT" ? "SIGINT" : child.signal;
    const code =
      child.status ??
      (signal ? `signal:${signal}` : "unknown");
    throw new Error(`command failed (${script} ${args.join(" ")}): ${code}`);
  }
}

function copyRuntimeAssets() {
  mkdirSync(SERVER_DIR, { recursive: true });
  const copied = copyPgliteAssets(root).join(", ");
  console.info(`[build-local-node-server] copied runtime assets: ${copied}`);
}

function buildLocalNodeAssetsIfNeeded(env) {
  if (env.SILVIA_LOCAL_NITRO !== "1") {
    return;
  }
  copyRuntimeAssets();
}

function verifyLocalNodeAssets() {
  const serverBundle = join(SERVER_DIR, "index.mjs");
  const missing = missingAssetRefs(readFileSync(serverBundle, "utf8"), PUBLIC_ASSET_DIR);
  if (missing.length) {
    throw new Error(`[build-local-node-server] missing literal CSS/JS assets: ${missing.join(", ")}`);
  }
}

function buildArgsFromAppEnv() {
  const env = mergeAppEnv(readAppEnv(root), process.env);
  return { ...env };
}

function main() {
  const env = buildArgsFromAppEnv();
  runNode(join(root, "scripts", "with-app-env.mjs"), ["vite", "build"], { env });
  if (env.SILVIA_LOCAL_NITRO === "1") verifyLocalNodeAssets();
  runNode(join(root, "scripts", "migrate.mjs"), [], { env });
  buildLocalNodeAssetsIfNeeded(env);

  // Keep stamp behavior unchanged for npm start / restart logic.
  const output = join(root, ".output", "silvia-src.stamp");
  if (existsSync(output)) {
    console.info(`[build-local-node-server] source stamp exists: ${readFileSync(output, "utf8").trim()}`);
  }
}

main();
