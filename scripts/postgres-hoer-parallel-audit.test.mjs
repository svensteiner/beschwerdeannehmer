import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const script = join(dirname(fileURLToPath(import.meta.url)), "postgres-hoer-parallel-audit.ts");
const tsx = join(dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "tsx", "dist", "cli.mjs");

function run(env) {
  return spawnSync(process.execPath, [tsx, script], {
    encoding: "utf8",
    env: { ...process.env, HOER_AUDIT_DATABASE_URL: "", ...env },
  });
}

test("Postgres-Hör-Audit überspringt ohne Required sicher", () => {
  const result = run({ HOER_AUDIT_REQUIRED: "" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /SKIP:.*keine Datenbank wurde kontaktiert/);
});

test("Postgres-Hör-Audit schlägt mit Required ohne URL fehl", () => {
  const result = run({ HOER_AUDIT_REQUIRED: "1" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL:.*keine Datenbank wurde kontaktiert/);
});

test("Postgres-Hör-Audit weist unzulässige URL auch mit Required zurück", () => {
  const result = spawnSync(process.execPath, [tsx, script], {
    encoding: "utf8",
    env: { ...process.env, HOER_AUDIT_REQUIRED: "1", HOER_AUDIT_DATABASE_URL: "postgres://remote/silvia_audit_test" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /REFUSE: Nur lokale PostgreSQL-Testdatenbanken/);
});
