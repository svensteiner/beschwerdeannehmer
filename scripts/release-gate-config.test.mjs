import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("Release-Gate startet seinen Server mit derselben Node-Laufzeit", async () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const source = await readFile(resolve(root, "playwright.release-gate.config.ts"), "utf8");

  assert.match(source, /const node = JSON\.stringify\(process\.execPath\)/);
  assert.match(source, /command: `\$\{node\} scripts\/release-gate-server\.mjs \$\{port\}`/);
  assert.doesNotMatch(source, /command: `node scripts\/release-gate-server/);
});
