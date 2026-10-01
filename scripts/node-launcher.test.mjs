import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { selectNodeExecutable } from "./node-launcher.mjs";

test("Node-Launcher wechselt bei einer alten Version zur unterstützten PATH-Version", () => {
  const seen = [];
  const selected = selectNodeExecutable({
    pathValue: "C:\\old;C:\\new",
    platform: "win32",
    currentExecutable: "C:\\old\\node.exe",
    currentVersion: "20.19.0",
    probe(executable) {
      seen.push(executable);
      return { status: 0, stdout: JSON.stringify({ version: executable.startsWith("C:\\new") ? "24.19.0" : "20.19.0", arch: "x64" }) };
    },
  });
  assert.equal(selected, "C:\\new\\node.exe");
  assert.deepEqual(seen, ["C:\\new\\node.exe"]);
});

test("Node-Launcher scheitert klar, wenn keine unterstützte PATH-Version existiert", () => {
  assert.throws(
    () => selectNodeExecutable({
      pathValue: "C:\\old;C:\\other",
      platform: "win32",
      currentExecutable: "C:\\old\\node.exe",
      currentVersion: "20.19.0",
      probe: () => ({ status: 0, stdout: JSON.stringify({ version: "20.19.0", arch: "x64" }) }),
    }),
    /Kein unterstütztes Node >=22\.12\.0 gefunden/,
  );
});

test("Node-Launcher überspringt unterstützte, aber architekturfremde PATH-Versionen", () => {
  const selected = selectNodeExecutable({
    pathValue: "C:\\arm64;C:\\x64",
    platform: "win32",
    currentExecutable: "C:\\old\\node.exe",
    currentVersion: "20.19.0",
    currentArch: "x64",
    probe(executable) {
      return {
        status: 0,
        stdout: JSON.stringify({ version: "24.19.0", arch: executable.startsWith("C:\\arm64") ? "arm64" : "x64" }),
      };
    },
  });
  assert.equal(selected, "C:\\x64\\node.exe");
});

test("POSIX-PATH wird mit Doppelpunkt getrennt und ohne Windows-Pfadformat verarbeitet", () => {
  const selected = selectNodeExecutable({
    pathValue: "/old:/new",
    platform: "linux",
    currentExecutable: "/old/node",
    currentVersion: "20.19.0",
    currentArch: "x64",
    probe() {
      return { status: 0, stdout: JSON.stringify({ version: "24.19.0", arch: "x64" }) };
    },
  });
  assert.equal(selected, "/new/node");
});

test("Produktionsstart und Preflight verwenden den Node-Launcher", () => {
  const packageJson = JSON.parse(
    readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
  );
  for (const name of ["start", "live:sandbox", "build", "preflight:production", "audit:production", "e2e:phone-gateway-production"]) {
    assert.match(packageJson.scripts[name], /node scripts\/node-launcher\.mjs/);
  }
});
