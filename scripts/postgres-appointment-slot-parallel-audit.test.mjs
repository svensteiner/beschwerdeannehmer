import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scripts = dirname(fileURLToPath(import.meta.url));
const script = join(scripts, "postgres-appointment-slot-parallel-audit.ts");
const tsx = join(scripts, "..", "node_modules", "tsx", "dist", "cli.mjs");

function run(env) {
  return spawnSync(process.execPath, [tsx, script], {
    encoding: "utf8",
    env: { ...process.env, APPOINTMENT_AUDIT_DATABASE_URL: "", ...env },
  });
}

test("Postgres-Termin-Audit überspringt ohne Required sicher", () => {
  const result = run({ APPOINTMENT_AUDIT_REQUIRED: "" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /SKIP:.*keine Datenbank wurde kontaktiert/);
});

test("Postgres-Termin-Audit schlägt mit Required ohne URL fehl", () => {
  const result = run({ APPOINTMENT_AUDIT_REQUIRED: "1" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL:.*keine Datenbank wurde kontaktiert/);
});

test("Postgres-Termin-Audit weist unzulässige URL zurück", () => {
  const result = run({
    APPOINTMENT_AUDIT_REQUIRED: "1",
    APPOINTMENT_AUDIT_DATABASE_URL: "postgres://remote/silvia_audit_test",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /REFUSE: Nur lokale PostgreSQL-Testdatenbanken/);
});
