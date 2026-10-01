import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { praxissoftwareRuntimeWith } from "./praxissoftware-runtime.ts";
import { VQUADRAT_LABEL } from "./praxissoftware.ts";
import "./bridge/adapters.ts"; // Vquadrat-Adapter registrieren (Nebenwirkung, wie bridge/adapters.ts es vorsieht)

// Gleiches Prinzip wie bridge/repo.test.ts: echtes PGLite im Speicher, Migrationen
// selbst angewendet (der Vite-Migrationspfad von db.ts läuft unter dem
// tsx-Testrunner nicht).
async function memoryDb(): Promise<Sql> {
  const pg = new PGlite();
  await pg.waitReady;
  const dir = join(process.cwd(), "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const text = await readFile(join(dir, file), "utf8");
    await pg["exec"](text);
  }
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    const res = await pg.query(text, values);
    return res.rows;
  }) as unknown as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => {
    const res = await pg.query<T>(text, params);
    return res.rows;
  };
  return sql;
}

test("praxissoftwareRuntimeWith: Standard verdrahtet den BridgeReader über den Adapter", async () => {
  const sql = await memoryDb();
  const port = praxissoftwareRuntimeWith(sql, "prax-1", VQUADRAT_LABEL, {});

  assert.equal(port.kind, "vquadrat");
  // Ohne SILVIA_PMS_URL bleibt der zugrunde liegende Adapter ein Stub, aber
  // die read-through-Fassade ruft ihn dennoch pro Plan-Strategie (4.5) auf.
  const res = await port.resources();
  assert.equal(res.ok, false);
});

test("praxissoftwareRuntimeWith: SILVIA_PMS_BRIDGE=0 überspringt die Bridge (Fluchtweg)", async () => {
  const sql = await memoryDb();
  const port = praxissoftwareRuntimeWith(sql, "prax-1", VQUADRAT_LABEL, { SILVIA_PMS_BRIDGE: "0" });

  assert.equal(port.kind, "vquadrat");
  const res = await port.resources();
  assert.deepEqual(res, { ok: false, reason: "notConnected" });
});
