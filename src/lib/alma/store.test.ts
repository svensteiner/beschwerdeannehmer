import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("speichert Demo-Praxiswissen transaktional in zwei Browser-Tabs", async () => {
  const { stdout } = await run(process.execPath, ["scripts/trained-facts-store.browser-audit.mjs"], {
    // The full suite starts many PGlite workers in parallel on Windows. Give
    // this isolated Chromium process a real startup window without removing
    // its bounded failure mode.
    cwd: projectRoot, timeout: 90_000, windowsHide: true,
  });
  const result = JSON.parse(stdout.trim()) as { ok?: boolean; facts?: string[] };
  assert.equal(result.ok, true);
  assert.equal(result.facts?.length, 40, "Grenze, Löschen und Retry müssen im Browser geprüft sein.");
});
