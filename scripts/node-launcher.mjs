import { spawnSync } from "node:child_process";
import path from "node:path";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  isSupportedProductionNode,
  MINIMUM_PRODUCTION_NODE_VERSION,
  parseNodeVersion,
} from "./node-runtime.mjs";

export function selectNodeExecutable({
  pathValue = process.env.PATH ?? "",
  platform = process.platform,
  probe = (executable) => spawnSync(executable, ["-p", "JSON.stringify({version:process.versions.node,arch:process.arch})"], { encoding: "utf8" }),
  currentExecutable = process.execPath,
  currentVersion = process.versions.node,
  currentArch = process.arch,
} = {}) {
  if (isSupportedProductionNode(currentVersion)) return currentExecutable;

  const executableName = platform === "win32" ? "node.exe" : "node";
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  for (const directory of pathValue.split(pathApi.delimiter)) {
    if (!directory.trim()) continue;
    const candidate = pathApi.join(directory.trim().replace(/^"|"$/g, ""), executableName);
    if (candidate.toLowerCase() === currentExecutable.toLowerCase()) continue;
    const result = probe(candidate);
    let identity;
    try { identity = JSON.parse(result.stdout?.trim() ?? ""); } catch { identity = null; }
    const version = parseNodeVersion(identity?.version);
    if (result.status === 0 && identity?.arch === currentArch && version && isSupportedProductionNode(version.join("."))) {
      return candidate;
    }
  }
  throw new Error(
    `Kein unterstütztes Node >=${MINIMUM_PRODUCTION_NODE_VERSION} gefunden (aktuell ${currentVersion}). ` +
      "Installiere eine unterstützte Version und öffne das Terminal neu.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [script, ...args] = process.argv.slice(2);
  if (!script) {
    console.error("Aufruf: node scripts/node-launcher.mjs <skript> [argumente …]");
    process.exit(2);
  }
  try {
    const executable = selectNodeExecutable();
    const versionCheck = spawnSync(executable, ["-p", "JSON.stringify({version:process.versions.node,arch:process.arch})"], { encoding: "utf8" });
    if (versionCheck.error || versionCheck.status !== 0) {
      throw versionCheck.error ?? new Error(`Node-Version konnte nicht gelesen werden: ${executable}`);
    }
    const identity = JSON.parse(versionCheck.stdout.trim());
    console.info(`[node-launcher] Verwende Node ${identity.version} ${identity.arch} (${executable})`);
    const productionAudit = script === "--production-audit";
    const command = productionAudit
      ? ["--input-type=module", "-e", "process.env.SILVIA_STANDALONE_AUDIT='1'; await import('./scripts/production-smoke-audit.mjs')"]
      : [script, ...args];
    const result = spawnSync(executable, command, { stdio: "inherit", env: process.env });
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
