import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

type OutcomeRow = { outcome: string };

async function fixture() {
  const pg = new PGlite();
  await pg.waitReady;
  for (const migration of [
    "0001_silvia.sql",
    "0036_emergency_audit.sql",
    "0038_emergency_atomic.sql",
  ]) {
    await pg.exec(await readFile(`migrations/${migration}`, "utf8"));
  }
  await pg.query(
    "insert into practices (id, name, owner_name, email) values ($1, $2, $3, $4)",
    ["practice-a", "Ordination A", "Frau Doktor", "a@example.test"],
  );
  return pg;
}

async function createEmergency(pg: PGlite, id: string, practiceId: string, auditId: string) {
  return (
    await pg.query<OutcomeRow>(
      "select create_emergency_atomic($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as outcome",
      [
        id,
        practiceId,
        "Frau Test",
        "Bello",
        "Hund",
        "Blutung, dringend",
        "Nachtdienst",
        "silvia",
        auditId,
        "Notfall erkannt und an den Nachtdienst geroutet.",
      ],
    )
  ).rows[0]?.outcome;
}

async function emergencyCount(pg: PGlite, id: string) {
  return (
    await pg.query<{ n: number }>("select count(*)::int as n from emergencies where id = $1", [id])
  ).rows[0]?.n ?? 0;
}

async function auditCount(pg: PGlite, emergencyId: string) {
  return (
    await pg.query<{ n: number }>(
      "select count(*)::int as n from emergency_audit where emergency_id = $1",
      [emergencyId],
    )
  ).rows[0]?.n ?? 0;
}

test("Notfall und erster Nachweis werden gemeinsam angelegt", async () => {
  const pg = await fixture();
  try {
    assert.equal(await createEmergency(pg, "e1", "practice-a", "ea-1"), "applied");
    const row = await pg.query<{ status: string; urgency: string }>(
      "select status, urgency from emergencies where id = $1",
      ["e1"],
    );
    assert.equal(row.rows[0]?.status, "verbunden");
    assert.equal(row.rows[0]?.urgency, "notfall");
    const audit = await pg.query<{ actor: string; status: string; note: string }>(
      "select actor, status, note from emergency_audit where emergency_id = $1",
      ["e1"],
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].actor, "silvia");
    assert.equal(audit.rows[0].status, "verbunden");
    assert.equal(audit.rows[0].note, "Notfall erkannt und an den Nachtdienst geroutet.");
  } finally {
    await pg.close();
  }
});

test("Schlaegt der Nachweis fehl, bleibt kein Notfall zurueck", async () => {
  const pg = await fixture();
  try {
    // Bewusst kollidierende Audit-ID: der Insert schlaegt fehl (Primary Key)
    // und muss auch die Notfall-Zeile zuruecknehmen.
    await pg.query(
      "insert into emergencies (id, practice_id, owner_name, pet, status) values ($1, $2, $3, $4, $5)",
      ["e-other", "practice-a", "X", "Y", "verbunden"],
    );
    await pg.query(
      "insert into emergency_audit (id, practice_id, emergency_id, actor, status, note) values ($1, $2, $3, $4, $5, $6)",
      ["ea-dup", "practice-a", "e-other", "silvia", "verbunden", "x"],
    );
    await assert.rejects(() => createEmergency(pg, "e2", "practice-a", "ea-dup"));
    assert.equal(await emergencyCount(pg, "e2"), 0);
  } finally {
    await pg.close();
  }
});

test("Jeder Aufruf legt einen eigenen Notfall samt Nachweis an", async () => {
  const pg = await fixture();
  try {
    assert.equal(await createEmergency(pg, "e3a", "practice-a", "ea-3a"), "applied");
    assert.equal(await createEmergency(pg, "e3b", "practice-a", "ea-3b"), "applied");
    assert.equal(await emergencyCount(pg, "e3a"), 1);
    assert.equal(await emergencyCount(pg, "e3b"), 1);
    assert.equal(await auditCount(pg, "e3a"), 1);
    assert.equal(await auditCount(pg, "e3b"), 1);
  } finally {
    await pg.close();
  }
});
