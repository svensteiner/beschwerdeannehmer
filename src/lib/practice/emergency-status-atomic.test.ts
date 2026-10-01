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
    "0037_emergency_status_atomic.sql",
  ]) {
    await pg.exec(await readFile(`migrations/${migration}`, "utf8"));
  }
  await pg.query(
    "insert into practices (id, name, owner_name, email) values ($1, $2, $3, $4)",
    ["practice-a", "Ordination A", "Frau Doktor", "a@example.test"],
  );
  await pg.query(
    "insert into practices (id, name, owner_name, email) values ($1, $2, $3, $4)",
    ["practice-b", "Ordination B", "Herr Doktor", "b@example.test"],
  );
  return pg;
}

async function insertEmergency(pg: PGlite, id: string, practiceId: string, status = "verbunden") {
  await pg.query(
    "insert into emergencies (id, practice_id, owner_name, pet, status) values ($1, $2, $3, $4, $5)",
    [id, practiceId, "Frau Test", "Bello", status],
  );
}

async function change(
  pg: PGlite,
  id: string,
  practiceId: string,
  status: string,
  actor: string,
  auditId: string,
) {
  return (
    await pg.query<OutcomeRow>(
      "select update_emergency_status_atomic($1, $2, $3, $4, $5) as outcome",
      [id, practiceId, status, actor, auditId],
    )
  ).rows[0]?.outcome;
}

async function emergencyStatus(pg: PGlite, id: string) {
  return (
    await pg.query<{ status: string }>("select status from emergencies where id = $1", [id])
  ).rows[0]?.status;
}

async function auditCount(pg: PGlite, emergencyId: string) {
  return (
    await pg.query<{ n: number }>(
      "select count(*)::int as n from emergency_audit where emergency_id = $1",
      [emergencyId],
    )
  ).rows[0]?.n ?? 0;
}

test("Statuswechsel schreibt Status und Nachweis gemeinsam", async () => {
  const pg = await fixture();
  try {
    await insertEmergency(pg, "e1", "practice-a", "verbunden");
    assert.equal(await change(pg, "e1", "practice-a", "übernommen", "Lisa Kassa", "ea-1"), "applied");
    assert.equal(await emergencyStatus(pg, "e1"), "übernommen");
    const rows = await pg.query<{ actor: string; status: string }>(
      "select actor, status from emergency_audit where emergency_id = $1 order by at asc",
      ["e1"],
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].actor, "Lisa Kassa");
    assert.equal(rows.rows[0].status, "übernommen");
  } finally {
    await pg.close();
  }
});

test("Scheitert der Nachweis, wird auch der Statuswechsel zurueckgenommen", async () => {
  const pg = await fixture();
  try {
    await insertEmergency(pg, "e2", "practice-a", "verbunden");
    // Bewusst kollidierende Audit-ID: der Insert schlaegt fehl (Primary Key)
    // und muss den Statuswechsel mit zuruecknehmen.
    await pg.query(
      "insert into emergency_audit (id, practice_id, emergency_id, actor, status, note) values ($1, $2, $3, $4, $5, $6)",
      ["ea-dup", "practice-a", "e2", "silvia", "verbunden", "geroutet"],
    );
    await assert.rejects(() => change(pg, "e2", "practice-a", "übernommen", "Lisa Kassa", "ea-dup"));
    assert.equal(await emergencyStatus(pg, "e2"), "verbunden");
    assert.equal(await auditCount(pg, "e2"), 1); // nur der vorab angelegte Eintrag
  } finally {
    await pg.close();
  }
});

test("Wiederholter Statuswechsel legt keinen zweiten Nachweis an", async () => {
  const pg = await fixture();
  try {
    await insertEmergency(pg, "e3", "practice-a", "verbunden");
    assert.equal(await change(pg, "e3", "practice-a", "übernommen", "Lisa Kassa", "ea-3"), "applied");
    assert.equal(await change(pg, "e3", "practice-a", "übernommen", "Lisa Kassa", "ea-3b"), "unchanged");
    assert.equal(await emergencyStatus(pg, "e3"), "übernommen");
    assert.equal(await auditCount(pg, "e3"), 1);
  } finally {
    await pg.close();
  }
});

test("Eine Praxis kann keinen Notfall einer anderen Praxis aendern", async () => {
  const pg = await fixture();
  try {
    await insertEmergency(pg, "e4", "practice-b", "verbunden");
    assert.equal(await change(pg, "e4", "practice-a", "übernommen", "Lisa Kassa", "ea-4"), "missing");
    assert.equal(await emergencyStatus(pg, "e4"), "verbunden");
    assert.equal(await auditCount(pg, "e4"), 0);
  } finally {
    await pg.close();
  }
});
