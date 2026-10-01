import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setMigrationSqlsForTest } from "./migration-sqls.ts";

test("fehlgeschlagenes Einspielen stellt die bisherige Tafel wieder her", async () => {
  const dir = mkdtempSync(join(tmpdir(), "silvia-rollback-"));
  process.env.SILVIA_DATA_DIR = dir;
  delete process.env.DATABASE_URL;

  // Vor dem Laden von db.server.ts: Migrationen leer einspritzen, damit der
  // eager Bootstrap nicht auf import.meta.glob (Vite-only) trifft.
  setMigrationSqlsForTest({});

  // Erst NACH dem Setzen der Umgebung laden: db.server.ts liest DATABASE_URL
  // und SILVIA_DATA_DIR beim Modul-Laden aus.
  const { replacePgliteFromDump, getSql, getPglite } = await import("./db.server.ts");
  const { setPgliteRestoreTestHooks } = await import("./pglite-restore-fs.ts");
  const { PGlite } = await import("@electric-sql/pglite");

  try {
    const sql = await getSql();
    await sql`create table rollback_marker (id text primary key, name text not null)`;
    await sql`insert into rollback_marker (id, name) values ('p1', 'Alt')`;

    // Gültiges, aber (fast) leeres Dump — der Inhalt ist egal, entscheidend ist
    // nur, dass es die Vorprüfung besteht und der Rollback danach greift.
    const src = new PGlite();
    await src.waitReady;
    const dump = await src.dumpDataDir("gzip");
    await src.close();

    setPgliteRestoreTestHooks({
      beforeLoad: () => {
        throw new Error("injizierter Einspiel-Fehler");
      },
    });

    await assert.rejects(
      () => replacePgliteFromDump(dump),
      /injizierter Einspiel-Fehler/,
    );

    setPgliteRestoreTestHooks(undefined);

    // Die bisherige Tafel muss unverändert wieder da sein — nicht die leere
    // Restore-Kopie, die gerade eingerichtet wurde.
    const after = await getSql();
    const rows = await after`select name from rollback_marker where id = 'p1'`;
    assert.equal(rows[0]?.name, "Alt");
  } finally {
    setPgliteRestoreTestHooks(undefined);
    try {
      const pg = await getPglite();
      if (!pg.closed) await pg.close();
    } catch {
      /* Best-Effort-Aufräumen — der Prozess endet hier ohnehin. */
    }
    delete process.env.SILVIA_DATA_DIR;
    rmSync(dir, { recursive: true, force: true });
    rmSync(`${dir}.prev`, { recursive: true, force: true });
  }
});
