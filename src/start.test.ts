import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

test("Server-Funktionen und interne Browser-Schreibwege haben CSRF-Schutz", async () => {
  const source = await readFile(fileURLToPath(new URL("./start.ts", import.meta.url)), "utf8");
  assert.match(source, /createCsrfMiddleware\(\s*\{/);
  assert.match(source, /filter: csrfProtectedRequest/);
  assert.match(source, /handlerType === "serverFn"/);
  assert.match(source, /handlerType === "router"/);
  assert.match(source, /"\/api\/tafel-holen"/);
  assert.match(source, /"\/api\/pms-sync"/);
  assert.match(source, /request\.method !== "POST"/);
});
