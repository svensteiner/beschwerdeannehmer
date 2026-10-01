import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { saveLead } from "./lead-storage.ts";
import type { Sql } from "@/lib/db";

async function database() {
  const db = new PGlite("memory://lead-test");
  await db.exec(await readFile("migrations/0001_silvia.sql", "utf8"));
  await db.exec(await readFile("migrations/0020_lead_request_id.sql", "utf8"));
  return db;
}
test("lead request id ist atomar, konflikt-sicher und Legacy bleibt möglich", async () => {
  const db = await database();
  try {
    const input = (id: string, hash: string, requestId = "11111111-1111-4111-8111-111111111111") => ({ id, requestId, payloadHash: hash, practice: "P", contact: "C", email: "c@example.test", phone: "", bundesland: "", pms: "", message: "" });
    const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.sql(strings, ...values)).rows) as unknown as Sql;
    const [one, two] = await Promise.all([saveLead(sql, input("lead-a", "same")), saveLead(sql, input("lead-b", "same"))]);
    assert.equal(Number(((await db.query("select count(*)::int as count from leads where request_id is not null")).rows[0] as { count?: unknown } | undefined)?.count ?? 0), 1);
    assert.ok(one); assert.ok(two); assert.equal(one, two); assert.match(one, /^lead-[ab]$/);
    const before = await db.query("select * from leads where request_id is not null");
    assert.equal(await saveLead(sql, input("lead-c", "different")), null);
    assert.deepEqual((await db.query("select * from leads where request_id is not null")).rows, before.rows);
    const legacyA = await saveLead(sql, { ...input("legacy-a", "", ""), requestId: undefined });
    const legacyB = await saveLead(sql, { ...input("legacy-b", "", ""), requestId: undefined });
    assert.ok(legacyA); assert.ok(legacyB); assert.match(legacyA, /^legacy-a$/); assert.match(legacyB, /^legacy-b$/);
    assert.equal(Number(((await db.query("select count(*)::int as count from leads")).rows[0] as { count?: unknown } | undefined)?.count ?? 0), 3);
  } finally { await db.close(); }
});
