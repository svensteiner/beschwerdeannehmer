// Synthetic in-memory integration: production getSql must reject unknown schema
// history before applying any bundled migration. Never opens a practice folder.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, readdir, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

if (!process.argv.includes("--isolated-child")) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|PATHEXT)$/i.test(key),
    ),
  );
  const runChild = (mode, dataDir = "memory") => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(import.meta.url), "--isolated-child", mode],
      {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        env: {
          ...env,
          SILVIA_DATA_DIR: dataDir,
          DATABASE_URL: "",
          SILVIA_LIVE_DEMO_ENABLED: "0",
        },
        stdio: "inherit",
        timeout: 60000,
      },
    );
    if (result.error) console.error(result.error.message);
    return result.status ?? 1;
  };
  for (const mode of ["reject", "upgrade"]) {
    process.exitCode = runChild(mode);
    if (process.exitCode !== 0) break;
  }
  if (process.exitCode === 0) {
    const dataDir = await mkdtemp(join(tmpdir(), "silvia-migration-downgrade-"));
    try {
      for (const mode of ["persistent-seed", "persistent-reject", "persistent-reject", "persistent-verify"]) {
        process.exitCode = runChild(mode, dataDir);
        if (process.exitCode !== 0) break;
      }
    } finally {
      const resolvedDir = await realpath(dataDir);
      const resolvedTemp = await realpath(tmpdir());
      assert.equal(dirname(resolvedDir).toLowerCase(), resolvedTemp.toLowerCase());
      assert.ok(basename(resolvedDir).startsWith("silvia-migration-downgrade-"));
      await rm(resolvedDir, { recursive: true, force: true });
    }
  }
} else {
  assert.equal(process.env.DATABASE_URL, "");
  const { PGlite } = await import("@electric-sql/pglite");
  const mode = process.argv.at(-1);
  const persistent = mode.startsWith("persistent-");
  const dataDir = process.env.SILVIA_DATA_DIR;
  assert.ok(dataDir);
  if (!persistent) assert.equal(dataDir, "memory");
  if (mode === "persistent-seed") {
    const pg = new PGlite({ dataDir });
    try {
      await pg.exec(
        "create table _migrations(name text primary key, applied_at timestamptz not null default now()); create table audit_sentinel(value text); insert into audit_sentinel values ('synthetic unchanged'); insert into _migrations(name) values ('9999_synthetic_future.sql');",
      );
      console.log("PASS: persistent synthetic future migration seeded.");
    } finally {
      await pg.close();
    }
  } else if (mode === "persistent-verify") {
    const pg = new PGlite({ dataDir });
    try {
      assert.deepEqual(
        (await pg.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows,
        [
          { tablename: "_migrations" },
          { tablename: "audit_sentinel" },
        ],
      );
      assert.deepEqual((await pg.query("select name from _migrations")).rows, [
        { name: "9999_synthetic_future.sql" },
      ]);
      assert.deepEqual((await pg.query("select value from audit_sentinel")).rows, [
        { value: "synthetic unchanged" },
      ]);
      console.log("PASS: persistent rejected database reopens with schema, history and sentinel unchanged.");
    } finally {
      await pg.close();
    }
  } else {
  const { createServer } = await import("vite");
  const pg = persistent ? new PGlite({ dataDir }) : new PGlite();
  // Never contend with the developer's running Vite process for node_modules/.vite.
  const viteCacheDir = await mkdtemp(join(tmpdir(), "silvia-migration-vite-"));
  let vite;
  try {
    const upgrade = mode === "upgrade";
    if (!persistent) await pg.exec(
      "create table _migrations(name text primary key, applied_at timestamptz not null default now()); create table audit_sentinel(value text); insert into audit_sentinel values ('synthetic unchanged');",
    );
    const migrationDir = new URL("../migrations/", import.meta.url);
    const names = (await readdir(migrationDir))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    let originalApplied;
    if (upgrade) {
      assert.ok(names.length > 1);
      await pg.exec(await readFile(new URL(names[0], migrationDir), "utf8"));
      await pg.query("insert into _migrations(name) values ($1)", [names[0]]);
      originalApplied = (
        await pg.query("select name, applied_at::text from _migrations")
      ).rows;
    } else if (!persistent) {
      await pg.exec(
        "insert into _migrations(name) values ('9999_synthetic_future.sql')",
      );
    }
    const before = (
      await pg.query(
        "select tablename from pg_tables where schemaname='public' order by tablename",
      )
    ).rows;
    globalThis.__pgliteInstance__ = Promise.resolve(pg);
    // Test explicit getSql calls; avoid a competing eager bootstrap rejection.
    globalThis.__pgBootstrapPromise__ = Promise.resolve();
    vite = await createServer({
      configFile: false,
      envDir: false,
      root: process.cwd(),
      cacheDir: viteCacheDir,
      resolve: { tsconfigPaths: true },
      server: { middlewareMode: true },
      appType: "custom",
    });
    const db = await vite.ssrLoadModule("/src/lib/db.server.ts");
    // Drain the module's background imports before closing the Vite loader.
    await vite.ssrLoadModule("/src/lib/practice/retention.ts");
    await vite.ssrLoadModule("/src/lib/practice/bridge/scheduler.ts");
    if (upgrade) {
      const sql = await db.getSql();
      assert.deepEqual(
        await sql.query("select name from _migrations order by name"),
        names.map((name) => ({ name })),
      );
      assert.deepEqual(
        await sql.query(
          "select name, applied_at::text from _migrations where name = $1",
          [names[0]],
        ),
        originalApplied,
      );
      const after = await sql.query(
        "select name, applied_at::text from _migrations order by name",
      );
      const again = await db.getSql();
      assert.deepEqual(
        await again.query(
          "select name, applied_at::text from _migrations order by name",
        ),
        after,
      );
      console.log(
        `PASS: production getSql upgrades from first to all ${names.length} migrations; original history unchanged; repeated access unchanged.`,
      );
    } else {
      for (let attempt = 0; attempt < 2; attempt++) {
        await assert.rejects(
          db.getSql(),
          /Datenbank passt nicht zu dieser App-Version/,
        );
      }
      assert.deepEqual(
        (
          await pg.query(
            "select tablename from pg_tables where schemaname='public' order by tablename",
          )
        ).rows,
        before,
      );
      assert.deepEqual((await pg.query("select name from _migrations")).rows, [
        { name: "9999_synthetic_future.sql" },
      ]);
      console.log(persistent
        ? "PASS: production getSql rejects after a persistent reopen; schema, migration history and synthetic sentinel unchanged."
        : "PASS: production getSql rejects twice; schema, migration history and synthetic sentinel unchanged.");
    }
    assert.deepEqual(
      (await pg.query("select value from audit_sentinel")).rows,
      [{ value: "synthetic unchanged" }],
    );
  } finally {
    await vite?.close();
    await pg.close();
    await rm(viteCacheDir, { recursive: true, force: true });
  }
  }
}
