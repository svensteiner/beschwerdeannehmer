import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./run-homepage-audit.mjs", import.meta.url), "utf8");

test("homepage audit wartet vor dem Start auf die Freigabe des eigenen Ports", () => {
  assert.match(source, /async function waitForPortFree\(targetPort\)/);
  assert.match(source, /attempt < 240/);
  assert.match(source, /await waitForPortFree\(port\);/);
  assert.match(source, /await waitForPortFree\(port\);[\s\S]*await rawWrites;/);
  assert.doesNotMatch(source, /listen\(8092/);
});
