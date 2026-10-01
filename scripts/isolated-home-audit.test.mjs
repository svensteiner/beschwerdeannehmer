import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const source = readFileSync(
  fileURLToPath(new URL("./isolated-home-audit.mjs", import.meta.url)),
  "utf8",
);

test("isolierter Audit verlangt unterstütztes Node und kopiert den Guard", () => {
  assert.match(source, /import \{ assertSupportedProductionNode \} from "\.\/node-runtime\.mjs"/);
  assert.match(source, /assertSupportedProductionNode\(\);/);
  assert.match(source, /"scripts\/node-runtime\.mjs"/);
});

test("isolierter Audit hält Vite- und Nitro-Arbeitsdateien in seiner Testkopie", () => {
  assert.match(source, /async function linkDependencyOverlay\(tempRoot\)/);
  assert.match(source, /new Set\(\["\.cache", "\.nitro", "\.vite", "\.vite-temp"\]\)/);
  assert.match(source, /await linkDependencyOverlay\(tempRoot\);/);
  assert.doesNotMatch(
    source,
    /await symlink\(join\(sourceRoot, "node_modules"\), modules, "junction"\);/,
  );
});

test("isolierter Audit enthält den Termin-Gesprächsaudit", () => {
  assert.match(source, /"scripts\/appointment-date-audit\.mjs"/);
  assert.match(source, /mode === "appointment"/);
});

test("isolierter Audit enthält den Sicherungs- und Wiederherstellungs-Audit", () => {
  assert.match(source, /"scripts\/backup-restore-audit\.mjs"/);
  assert.match(source, /mode === "backup-restore"/);
});
