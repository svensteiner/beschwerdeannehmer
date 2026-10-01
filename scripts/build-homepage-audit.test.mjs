import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { auditBuildEnv, isolatedAuditBuild } from "./build-homepage-audit.mjs";

const tempRoot = String.raw`C:\Users\audit\AppData\Local\Temp`;
const allowedRoot = String.raw`C:\Users\audit\AppData\Local\Temp\silvia-home-audit-clean`;
const sourceRoot = String.raw`C:\silvia`;
const npmCli = String.raw`C:\node\node_modules\npm\bin\npm-cli.js`;

function spawnWithExit(calls, code) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("exit", code, null));
    return child;
  };
}

function pathsFor(root) {
  return async (value) => {
    if (value === tempRoot) return tempRoot;
    if (value === npmCli) return npmCli;
    return root;
  };
}

test("lehnt Projektordner und aufgelöste Junction vor spawn ab", async () => {
  for (const requested of [sourceRoot, String.raw`C:\Users\audit\AppData\Local\Temp\silvia-home-audit-junction`]) {
    const calls = [];
    await assert.rejects(
      isolatedAuditBuild(requested, {
        realpathImpl: pathsFor(sourceRoot),
        tmpdirImpl: () => tempRoot,
        npmCliPath: npmCli,
        spawnImpl: spawnWithExit(calls, 0),
      }),
      /isolierte Tempkopie/,
    );
    assert.equal(calls.length, 0);
  }
});

test("startet nur den erlaubten Tempbuild mit bereinigter Umgebung", async () => {
  const calls = [];
  const result = await isolatedAuditBuild(allowedRoot, {
    realpathImpl: pathsFor(allowedRoot),
    tmpdirImpl: () => tempRoot,
    npmCliPath: npmCli,
    parentEnv: { PATH: "C:\\node", TEMP: "C:\\temp", OPENAI_API_KEY: "secret", CUSTOM: "no" },
    spawnImpl: spawnWithExit(calls, 0),
  });
  assert.equal(result, allowedRoot);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    command: process.execPath,
    args: [npmCli, "run", "build"],
    options: {
      cwd: allowedRoot,
      env: { PATH: "C:\\node", TEMP: "C:\\temp", SILVIA_LOCAL_NITRO: "1" },
      stdio: "inherit",
      windowsHide: true,
    },
  });
  assert.deepEqual(auditBuildEnv({ Path: "C:\\node", OPENAI_API_KEY: "secret" }), { Path: "C:\\node", SILVIA_LOCAL_NITRO: "1" });
});

test("reicht einen fehlgeschlagenen Build weiter", async () => {
  const calls = [];
  await assert.rejects(
    isolatedAuditBuild(allowedRoot, {
      realpathImpl: pathsFor(allowedRoot),
      tmpdirImpl: () => tempRoot,
      npmCliPath: npmCli,
      spawnImpl: spawnWithExit(calls, 7),
    }),
    /fehlgeschlagen \(7\)/,
  );
  assert.equal(calls.length, 1);
});

test("CLI lehnt einen Projektpfad vor jedem Build ab", () => {
  const script = fileURLToPath(new URL("./build-homepage-audit.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, sourceRoot], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /isolierte Tempkopie/);
});
