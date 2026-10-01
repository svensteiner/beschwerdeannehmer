// Isolierter Homepage-Build: akzeptiert ausschließlich eine aufgelöste Tempkopie.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SAFE_ENV = /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA)$/i;

export function auditBuildEnv(parentEnv = process.env) {
  return {
    ...Object.fromEntries(Object.entries(parentEnv).filter(([key]) => SAFE_ENV.test(key))),
    SILVIA_LOCAL_NITRO: "1",
  };
}

export async function isolatedAuditBuild(targetPath, {
  spawnImpl = spawn,
  realpathImpl = realpath,
  tmpdirImpl = tmpdir,
  parentEnv = process.env,
  npmCliPath = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
} = {}) {
  assert.ok(targetPath, "Bitte den Pfad der isolierten Tempkopie angeben.");
  const tempRoot = await realpathImpl(tmpdirImpl());
  const buildRoot = await realpathImpl(resolve(targetPath));
  const permittedPrefix = "silvia-home-audit-";
  assert.ok(
    basename(buildRoot).toLowerCase().startsWith(permittedPrefix),
    "Nur eine aufgelöste isolierte Tempkopie unter silvia-home-audit- ist zulässig.",
  );
  assert.equal(
    dirname(buildRoot).toLowerCase(),
    tempRoot.toLowerCase(),
    "Der Buildpfad muss direkt unter dem System-Tempordner liegen.",
  );
  const verifiedNpmCli = await realpathImpl(npmCliPath);

  const child = spawnImpl(process.execPath, [verifiedNpmCli, "run", "build"], {
    cwd: buildRoot,
    env: auditBuildEnv(parentEnv),
    stdio: "inherit",
    windowsHide: true,
  });
  await new Promise((resolveBuild, rejectBuild) => {
    child.once("error", rejectBuild);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveBuild();
      else rejectBuild(new Error(`Isolierter Homepage-Build fehlgeschlagen (${signal ?? code ?? "unbekannt"}).`));
    });
  });
  return buildRoot;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  isolatedAuditBuild(process.argv[2]).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
