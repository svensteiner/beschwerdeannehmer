/** Which database backend is active. */
export type DbSource = "neon" | "pglite";

// An empty/whitespace DATABASE_URL (an easy misconfig in deploy UIs) must mean
// "unset" — otherwise production would silently run on the PGLite fallback.
const rawDatabaseUrl =
  typeof process !== "undefined" ? process.env.DATABASE_URL : undefined;
const databaseUrl =
  rawDatabaseUrl && rawDatabaseUrl.trim() ? rawDatabaseUrl : undefined;

/**
 * Active backend: real **Postgres** when `DATABASE_URL` is set, otherwise a local
 * embedded **PGLite** (Postgres compiled to WASM). PGLite writes to `.silvia-data`
 * so `npm start` / `npm run dev` restart keeps the Ordination; `SILVIA_DATA_DIR=memory` is RAM
 * only. Swap in hosted Postgres later by setting `DATABASE_URL`; no code changes.
 */
export const dbSource: DbSource = databaseUrl ? "neon" : "pglite";

/**
 * Minimal shared SQL surface, satisfied by both Neon and PGLite. Both the
 * tagged-template and `.query()` forms resolve to an array of row objects:
 *
 *   const sql = await getSql();
 *   const rows = await sql`select * from todos where id = ${id}`; // parameterized
 *   const rows2 = await sql.query("select * from todos where id = $1", [id]);
 */
export interface Sql {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
}

/**
 * Init state lives on globalThis as promises: dev HMR creates new instances of
 * this module, and two instances racing module-level state would open a second
 * pool or run two concurrent PGLite migration passes (whose duplicate
 * `_migrations` insert rejects — and would get memoized, poisoning every later
 * `getSql()`). A failed init clears its slot so the next call retries.
 */
const globalRef = globalThis as typeof globalThis & {
  __pgSqlPromise__?: Promise<Sql>;
  __pgliteInstance__?: Promise<import("@electric-sql/pglite").PGlite>;
  __pgliteMigrateChain__?: Promise<void>;
  __pgliteReplaceChain__?: Promise<void>;
  __pgliteRestoreBlocked__?: Error;
};

export { isTafelAnzeige } from "./pglite-anzeige";

/**
 * Result-type parity: Postgres sends every value as text plus a type OID — the
 * JS value is the DRIVER's parsing choice, and pg and PGLite disagree (pg:
 * int8 -> string, date -> local-midnight Date; PGLite: int8 -> BigInt, which
 * JSON.stringify rejects, date -> UTC Date). Normalize both so preview and
 * production return identical, JSON-safe shapes:
 *   int8/bigint (incl. count(*)) -> number (past 2^53 loses precision — cast
 *                                   `::text` if you ever need huge integers)
 *   date                         -> 'YYYY-MM-DD' string
 *   interval                     -> Postgres interval text
 * numeric already comes back as a string on both (arbitrary precision).
 */
const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (v: string) => v;

type Run = <T>(text: string, params: unknown[]) => Promise<T[]>;

/** Wrap a query runner in the tagged-template + `.query()` `Sql` surface. */
function toSql(run: Run): Sql {
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    // Rebuild with $1, $2, … placeholders so values stay parameterized.
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);
  return sql;
}

function createNeonSql(): Promise<Sql> {
  globalRef.__pgSqlPromise__ ??= (async () => {
    // Regular Postgres driver: node-postgres (`pg`) — works directly with Neon's
    // pooled endpoint. One pool per process; warm serverless instances reuse it.
    const { Pool, types } = await import("pg");
    types.setTypeParser(OID_INT8, Number);
    types.setTypeParser(OID_DATE, identity);
    types.setTypeParser(OID_INTERVAL, identity);
    const pool = new Pool({ connectionString: databaseUrl });
    return toSql(async <T>(text: string, params: unknown[]) => {
      const res = await pool.query(text, params);
      return res.rows as T[];
    });
  })().catch((err) => {
    globalRef.__pgSqlPromise__ = undefined;
    throw err;
  });
  return globalRef.__pgSqlPromise__;
}

const PGLITE_PARSERS = {
  [OID_INT8]: Number,
  [OID_DATE]: identity,
  [OID_INTERVAL]: identity,
};

async function openPgliteWrite(opts: { dataDir?: string; loadDataDir?: Blob } = {}) {
  if (opts.dataDir) {
    if (!opts.loadDataDir) {
    // A .prev folder means a prior restore did not reach its safe completion.
    // Do not let PGlite create/open a fresh folder beside it on a process restart.
      const { pgliteRestoreFs } = await import("./pglite-restore-fs");
      const { access } = await pgliteRestoreFs();
      try {
        await access(`${opts.dataDir}.prev`);
        throw new Error("Eine frühere Tafel-Sicherung liegt noch neben dem Datenordner.");
      } catch (err) {
        if (err instanceof Error && err.message.includes("frühere Tafel-Sicherung")) throw err;
        const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
        if (code !== "ENOENT") throw err;
      }
    }
    const { acquirePgliteLock } = await import("./pglite-lock");
    await acquirePgliteLock(opts.dataDir);
    const { recoverStaleCopyBusy } = await import("./pglite-copy-gate");
    recoverStaleCopyBusy(opts.dataDir);
  }
  return bootPglite(opts);
}

/** Snapshot the writer folder only when copy-seq is stable and the dest can boot. */
async function copyWriterSnapshot(src: string, dest: string) {
  const { pgliteSnapshotReady, snapshotPgliteDataDir } = await import("./pglite-anzeige");
  const { anzeigeCopyShouldRetry, assertCopyIdle, isCopyBusy, readCopySeq } =
    await import("./pglite-copy-gate");
  await assertCopyIdle(src);
  const seqBefore = readCopySeq(src);
  snapshotPgliteDataDir(src, dest);
  if (
    anzeigeCopyShouldRetry({
      busy: isCopyBusy(src),
      before: seqBefore,
      after: readCopySeq(src),
    })
  ) {
    throw new Error("Die Tafel-Kopie kam mitten im Speichern.");
  }
  if (!pgliteSnapshotReady(dest)) {
    throw new Error("Die Tafel-Kopie ist unvollständig.");
  }
}

async function openPgliteAnzeige(srcDir: string) {
  const { ANZEIGE_COPY_ATTEMPTS, anzeigeAltDir, pgliteAnzeigeDir, setCurrentAnzeigeDir, setTafelAnzeige } =
    await import("./pglite-anzeige");
  const { rmDirRetrySync } = await import("./pglite-fs");
  setTafelAnzeige(true);
  const live = pgliteAnzeigeDir();
  const staging = anzeigeAltDir(live);
  let lastErr: unknown;
  for (let attempt = 0; attempt < ANZEIGE_COPY_ATTEMPTS; attempt++) {
    let probe: import("@electric-sql/pglite").PGlite | undefined;
    try {
      await copyWriterSnapshot(srcDir, staging);
      probe = await bootPglite({ dataDir: staging });
      await probe.query("select 1");
      setCurrentAnzeigeDir(staging);
      console.info(`[db] PGLite Anzeige — Kopie ${staging} (Tafel bleibt auf dem anderen Rechner)`);
      return probe;
    } catch (err) {
      lastErr = err;
      if (probe && !probe.closed) await probe.close().catch(() => undefined);
      rmDirRetrySync(staging);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Die Tafel-Kopie ließ sich nicht laden.");
}

async function openPglite(opts: { dataDir?: string; loadDataDir?: Blob } = {}) {
  const { setTafelAnzeige, wantsForcedAnzeige } = await import("./pglite-anzeige");
  if (opts.loadDataDir) {
    setTafelAnzeige(false);
    return openPgliteWrite(opts);
  }
  if (opts.dataDir && wantsForcedAnzeige()) {
    return openPgliteAnzeige(opts.dataDir);
  }
  if (opts.dataDir) {
    try {
      const pg = await openPgliteWrite(opts);
      setTafelAnzeige(false);
      return pg;
    } catch (err) {
      const { isPgliteHeldError } = await import("./pglite-lock");
      if (isPgliteHeldError(err)) return openPgliteAnzeige(opts.dataDir);
      throw err;
    }
  }
  setTafelAnzeige(false);
  return openPgliteWrite(opts);
}

async function bootPglite(opts: { dataDir?: string; loadDataDir?: Blob } = {}) {
  try {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite({
      ...(opts.dataDir ? { dataDir: opts.dataDir } : {}),
      ...(opts.loadDataDir ? { loadDataDir: opts.loadDataDir } : {}),
      parsers: PGLITE_PARSERS,
    });
    await pg.waitReady;
    if (opts.dataDir) {
      console.info(`[db] PGLite data dir ${opts.dataDir}`);
    } else {
      console.info("[db] PGLite in memory — restart wipes the Ordination");
    }
    if (opts.loadDataDir) {
      console.info("[db] PGLite loaded from dump");
    }
    await pg.exec(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    return pg;
  } catch (err) {
    if (opts.dataDir) {
      const { isTafelAnzeige } = await import("./pglite-anzeige");
      if (!isTafelAnzeige()) {
        const { releasePgliteLock } = await import("./pglite-lock");
        await releasePgliteLock(opts.dataDir).catch(() => undefined);
      }
    }
    throw err;
  }
}

function startPgliteInstance(opts: { dataDir?: string; loadDataDir?: Blob } = {}) {
  const started = openPglite(opts).catch((err) => {
    globalRef.__pgliteInstance__ = undefined;
    throw err;
  });
  globalRef.__pgliteInstance__ = started;
  return started;
}

function clearPgliteMemos() {
  sqlPromise = null;
  globalRef.__pgliteInstance__ = undefined;
  globalRef.__pgliteMigrateChain__ = undefined;
}

async function createPgliteSql(): Promise<Sql> {
  // Embedded Postgres, imported on demand so it never loads on the Neon path.
  // One instance per process, shared across HMR module instances. The default
  // data dir (`.silvia-data`) survives process restart; `SILVIA_DATA_DIR=memory`
  // is RAM only. Do not HMR this file while a second PGLite would open the same dir.
  const [{ resolvePgliteDataDir }, { assertAppliedMigrationsKnown, pendingMigrations }, { loadMigrationSqls }] = await Promise.all([
    import("./pglite-data-dir"),
    import("../../scripts/migration-plan.mjs"),
    import("./migration-sqls.ts"),
  ]);
  const dataDir = resolvePgliteDataDir();
  globalRef.__pgliteInstance__ ??= startPgliteInstance(dataDir ? { dataDir } : {});
  const pg = await globalRef.__pgliteInstance__;

  // Apply migrations/ (the single schema source) so preview matches production.
  // SQL is inlined by the bundler via import.meta.glob (no runtime fs); applied
  // files are tracked in _migrations. The glob does not descend, so the opt-in
  // auth schema under migrations/auth/ stays out. Runs once per module instance
  // — so an HMR reload after adding a migration file applies it live — with
  // passes serialized on a global chain so concurrent callers never
  // double-apply.
  const migrate = async (): Promise<void> => {
    const migrations = loadMigrationSqls();
    const doneRows = await pg.query<{ name: string }>(
      "select name from _migrations",
    );
    const done = doneRows.rows.map((r) => r.name);
    // Check compatibility before the first pending statement, so a newer DB
    // cannot be partially changed by an older app bundle.
    assertAppliedMigrationsKnown(Object.keys(migrations), done);
    for (const { name, path } of pendingMigrations(Object.keys(migrations), done)) {
      // Apply + record atomically (parity with scripts/migrate.mjs) so a failed
      // statement can't leave a file half-applied but untracked.
      await pg.transaction(async (tx) => {
        await tx.exec(migrations[path]);
        await tx.query("insert into _migrations (name) values ($1)", [name]);
      });
    }
  };
  const pass = (globalRef.__pgliteMigrateChain__ ?? Promise.resolve())
    .catch(() => undefined) // an earlier failed pass must not wedge the chain
    .then(migrate);
  globalRef.__pgliteMigrateChain__ = pass;
  await pass;

  return toSql(async <T>(text: string, params: unknown[]) => {
    const { isTafelAnzeige, sqlIsAnzeigeAllowed, sqlIsReadOnly, TAFEL_ANZEIGE_ERROR } =
      await import("./pglite-anzeige");
    if (isTafelAnzeige() && !sqlIsAnzeigeAllowed(text)) {
      throw new Error(TAFEL_ANZEIGE_ERROR);
    }
    const { withWriterCopyGate } = await import("./pglite-copy-gate");
    const write = Boolean(dataDir) && !isTafelAnzeige() && !sqlIsReadOnly(text);
    return withWriterCopyGate(dataDir, write, async () => {
      const result = await pg.query<T>(text, params);
      return result.rows;
    });
  });
}

let sqlPromise: Promise<Sql> | null = null;

async function createSql(): Promise<Sql> {
  if (typeof window !== "undefined") {
    throw new Error(
      "@/lib/db is server-only — call getSql() from a createServerFn handler " +
        "or a server route loader, never from client code.",
    );
  }
  return dbSource === "neon" ? createNeonSql() : createPgliteSql();
}

/**
 * Get the shared, **server-only** SQL client. Postgres when `DATABASE_URL` is set,
 * otherwise the local PGLite fallback (`.silvia-data` by default). Memoized.
 *
 * Schema comes from `migrations/*.sql`, auto-applied before the first query on
 * both backends — define tables there, never inline in server functions.
 */
export function getSql(): Promise<Sql> {
  if (globalRef.__pgliteRestoreBlocked__) {
    return Promise.reject(globalRef.__pgliteRestoreBlocked__);
  }
  const gate = (globalRef.__pgliteReplaceChain__ ?? Promise.resolve()).catch(() => undefined);
  return gate.then(async () => {
    // A caller may have started waiting before a rollback failure marked the
    // process blocked. Check again after the replace chain, not only on entry.
    if (globalRef.__pgliteRestoreBlocked__) throw globalRef.__pgliteRestoreBlocked__;
    await applyPendingHolenIfAny();
    if (globalRef.__pgliteRestoreBlocked__) throw globalRef.__pgliteRestoreBlocked__;
    sqlPromise ??= createSql().catch((err) => {
      sqlPromise = null; // don't memoize failures — let the next call retry
      throw err;
    });
    return sqlPromise;
  });
}

/**
 * The shared PGLite instance (preview only), with `migrations/*.sql` applied.
 * Lets Better Auth persist to the SAME embedded DB as app data in preview (via a
 * Kysely dialect). Throws when `DATABASE_URL` is set (that path uses Neon).
 */
export async function getPglite(): Promise<import("@electric-sql/pglite").PGlite> {
  if (dbSource !== "pglite") {
    throw new Error("getPglite() is only available on the PGLite fallback (no DATABASE_URL)");
  }
  await getSql();
  const pg = await globalRef.__pgliteInstance__;
  if (!pg) throw new Error("PGLite instance failed to initialize");
  return pg;
}

async function closePgliteInstanceOnly() {
  const existing = globalRef.__pgliteInstance__;
  if (existing) {
    try {
      const pg = await existing;
      if (!pg.closed) await pg.close();
    } catch {
      /* init failed or already closed */
    }
  }
}

async function closeCurrentPglite() {
  await closePgliteInstanceOnly();
  const { resolvePgliteDataDir } = await import("./pglite-data-dir");
  const dataDir = resolvePgliteDataDir();
  if (dataDir) {
    const { releasePgliteLock } = await import("./pglite-lock");
    await releasePgliteLock(dataDir).catch(() => undefined);
  }
}

async function rmRestoreDir(path: string) {
  const { removePgliteRestoreDirForTest } = await import("./pglite-restore-fs");
  if (await removePgliteRestoreDirForTest(path)) return;
  const { rmDirRetry } = await import("./pglite-fs");
  await rmDirRetry(path);
}

export type AnzeigeKeptSession = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string | Date;
};

async function restoreAnzeigeSession(sql: Sql, keep: AnzeigeKeptSession) {
  const exists = await sql<{ id: string }>`
    select id from practice_sessions where token_hash = ${keep.token_hash} limit 1
  `;
  if (exists[0]) return;
  const expires =
    keep.expires_at instanceof Date ? keep.expires_at.toISOString() : String(keep.expires_at);
  await sql`
    insert into practice_sessions (id, user_id, token_hash, expires_at)
    values (${keep.id}, ${keep.user_id}, ${keep.token_hash}, ${expires})
  `;
}

async function closeSavedPglite(existing?: Promise<import("@electric-sql/pglite").PGlite>) {
  if (!existing) return;
  try {
    const pg = await existing;
    if (!pg.closed) await pg.close();
  } catch {
    /* init failed or already closed */
  }
}

async function refreshPgliteAnzeigeInner(src: string, keep?: AnzeigeKeptSession | null) {
  const {
    ANZEIGE_COPY_ATTEMPTS,
    TAFEL_ANZEIGE_REFRESH_WRITER_ERROR,
    anzeigeAltDir,
    currentAnzeigeDir,
    isTafelAnzeige,
    setCurrentAnzeigeDir,
    setTafelAnzeige,
  } = await import("./pglite-anzeige");
  const { rmDirRetrySync } = await import("./pglite-fs");
  if (!isTafelAnzeige()) {
    throw new Error(TAFEL_ANZEIGE_REFRESH_WRITER_ERROR);
  }
  const live = currentAnzeigeDir();
  const staging = anzeigeAltDir(live);
  let lastErr: unknown;

  for (let attempt = 0; attempt < ANZEIGE_COPY_ATTEMPTS; attempt++) {
    let probe: import("@electric-sql/pglite").PGlite | undefined;
    try {
      await copyWriterSnapshot(src, staging);
      probe = await bootPglite({ dataDir: staging });
      await probe.query("select 1");
    } catch (err) {
      lastErr = err;
      if (probe && !probe.closed) await probe.close().catch(() => undefined);
      rmDirRetrySync(staging);
      continue;
    }

    const previous = globalRef.__pgliteInstance__;
    globalRef.__pgliteInstance__ = Promise.resolve(probe);
    sqlPromise = null;
    globalRef.__pgliteMigrateChain__ = undefined;
    setTafelAnzeige(true);
    setCurrentAnzeigeDir(staging);
    sqlPromise = createSql();
    const sql = await sqlPromise;
    // Session row before the replace chain resolves — otherwise the poll logs out.
    if (keep) await restoreAnzeigeSession(sql, keep);
    await closeSavedPglite(previous);
    if (live && live !== staging) {
      rmDirRetrySync(live);
    }
    return;
  }

  throw lastErr instanceof Error ? lastErr : new Error("Die Tafel-Kopie ließ sich nicht neu laden.");
}

/**
 * Re-copy the writer's PGLite folder onto the Anzeige process. Does not take
 * `silvia.lock`. Concurrent `getSql()` waits until this finishes, including
 * restoring the Anzeige session row.
 */
export async function refreshPgliteAnzeige(keep?: AnzeigeKeptSession | null): Promise<void> {
  if (dbSource !== "pglite") {
    throw new Error("Tafel neu laden gibt es nur ohne DATABASE_URL.");
  }
  const { isTafelAnzeige, TAFEL_ANZEIGE_REFRESH_WRITER_ERROR } = await import("./pglite-anzeige");
  if (!isTafelAnzeige()) {
    throw new Error(TAFEL_ANZEIGE_REFRESH_WRITER_ERROR);
  }
  const { resolvePgliteDataDir } = await import("./pglite-data-dir");
  const src = resolvePgliteDataDir();
  if (!src) {
    throw new Error("Ohne Tafel-Ordner gibt es keine Kopie zum Laden.");
  }
  const run = (globalRef.__pgliteReplaceChain__ ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => refreshPgliteAnzeigeInner(src, keep));
  globalRef.__pgliteReplaceChain__ = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function replacePgliteFromDumpInner(dump: Blob) {
  const { resolvePgliteDataDir } = await import("./pglite-data-dir");
  const { rmDirRetry } = await import("./pglite-fs");
  const dataDir = resolvePgliteDataDir();
  await closeCurrentPglite();
  clearPgliteMemos();

  const { pgliteRestoreFs, beforePgliteRestoreLoad } = await import("./pglite-restore-fs");
  const { access, mkdir, rename } = await pgliteRestoreFs();
  let prevDir: string | undefined;
  if (dataDir) {
    const prev = `${dataDir}.prev`;
    try {
      await access(prev);
      throw new Error("Eine frühere Tafel-Sicherung liegt noch neben dem Datenordner.");
    } catch (err) {
      if (err instanceof Error && err.message.includes("frühere Tafel-Sicherung")) throw err;
      const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
      if (code !== "ENOENT") throw err;
    }
    try {
      await rename(dataDir, prev);
      prevDir = prev;
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
      if (code === "ENOENT") {
        /* first boot: there is no existing folder to preserve */
      } else {
        // Do not load a dump into a folder whose original contents could not
        // be moved aside. Re-open the old folder when possible, then surface
        // the actual filesystem error to the caller.
        try {
          startPgliteInstance({ dataDir });
          sqlPromise = createSql();
          await sqlPromise;
        } catch (reopenErr) {
          throw new AggregateError([err, reopenErr], "Die bisherige Tafel ließ sich nach dem Umbenennen nicht öffnen.");
        }
        throw err;
      }
    }
    try {
      await mkdir(dataDir, { recursive: true });
    } catch (err) {
      await closePgliteInstanceOnly();
      clearPgliteMemos();
      if (!prevDir) {
        await rmDirRetry(dataDir).catch(() => undefined);
        throw err;
      }
      try {
        await rename(prevDir, dataDir);
      } catch (rollbackErr) {
        const blocked = new AggregateError(
          [err, rollbackErr],
          "Die bisherige Tafel ließ sich nach dem Anlegen des Restore-Ordners nicht sichern.",
        );
        globalRef.__pgliteRestoreBlocked__ = blocked;
        throw blocked;
      }
      startPgliteInstance({ dataDir });
      sqlPromise = createSql();
      await sqlPromise;
      throw err;
    }
  }

  try {
    await beforePgliteRestoreLoad();
    startPgliteInstance({
      ...(dataDir ? { dataDir } : {}),
      loadDataDir: dump,
    });
    sqlPromise = createSql();
    await sqlPromise;
    if (prevDir) {
      await rmDirRetry(prevDir).catch((cleanupErr) => {
        // Nicht still schlucken: ein liegen gebliebener .prev-Ordner blockiert
        // die nächste Sicherung („frühere Tafel-Sicherung liegt noch daneben“).
        console.error("[db] .prev-Ordner ließ sich nach dem Restore nicht entfernen", cleanupErr);
      });
    }
  } catch (err) {
    await closePgliteInstanceOnly();
    clearPgliteMemos();
    if (dataDir && prevDir) {
      try {
        await rmRestoreDir(dataDir);
        await rename(prevDir, dataDir);
      } catch (rollbackErr) {
        const blocked = new AggregateError(
          [err, rollbackErr],
          "Die bisherige Tafel konnte nach dem fehlgeschlagenen Restore nicht sicher wiederhergestellt werden.",
        );
        globalRef.__pgliteRestoreBlocked__ = blocked;
        throw blocked;
      }
    } else if (dataDir) {
      // No previous folder was moved aside (first boot). The failed loader may
      // have created a partial directory; never reopen it as if it were valid.
      await rmRestoreDir(dataDir);
    }
    if (dataDir && prevDir) {
      startPgliteInstance({ dataDir });
      sqlPromise = createSql();
      await sqlPromise;
    } else if (!dataDir) {
      startPgliteInstance();
      sqlPromise = createSql();
      await sqlPromise;
    }
    throw err;
  }
}

const HOLEN_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

async function restoreHolenSession(
  sql: Sql,
  meta: { email: string; tokenHash: string },
) {
  const rows = await sql<{ id: string }>`
    select id from practice_users where email = ${meta.email} limit 1
  `;
  const user = rows[0];
  if (!user) return false;
  const existing = await sql<{ id: string }>`
    select id from practice_sessions where token_hash = ${meta.tokenHash} limit 1
  `;
  if (existing[0]) return true;
  const { newId } = await import("./practice/crypto");
  await sql`
    insert into practice_sessions (id, user_id, token_hash, expires_at)
    values (
      ${newId()},
      ${user.id},
      ${meta.tokenHash},
      ${new Date(Date.now() + HOLEN_SESSION_MS).toISOString()}
    )
  `;
  return true;
}

/**
 * Start applying a pending holen dump without blocking the restore HTTP
 * response. The reload's `getSql()` waits on the same replace chain.
 */
export function schedulePendingHolenApply() {
  if (dbSource !== "pglite") return;
  void getSql().catch(() => undefined);
}

/**
 * Tafel holen writes the gzip beside the folder and returns HTTP first.
 * The next writer `getSql()` applies it so the restore response cannot drop
 * mid-`replacePgliteFromDump`.
 */
async function applyPendingHolenIfAny() {
  if (dbSource !== "pglite") return;
  const { isTafelAnzeige } = await import("./pglite-anzeige");
  const { resolvePgliteDataDir } = await import("./pglite-data-dir");
  const dataDir = resolvePgliteDataDir();
  const {
    holenPendingShouldApply,
    holenPendingIsOpen,
    readPendingHolen,
    clearPendingHolen,
    writeHolenFail,
    clearHolenFail,
    holenLoginEmailFromOwners,
    writeHolenLoginEmail,
  } = await import("./pglite-holen-pending");
  if (!holenPendingShouldApply({ anzeige: isTafelAnzeige(), dataDir })) return;
  const pending = readPendingHolen(dataDir);
  if (!pending) {
    // Dateien liegen, sind aber nicht lesbar (korrupter Restbestand, z. B. kaputte
    // meta.json). Nicht ewig „läuft noch“ anzeigen: aufräumen und klar melden.
    if (holenPendingIsOpen(dataDir)) {
      clearPendingHolen(dataDir);
      writeHolenFail(dataDir);
    }
    return;
  }
  try {
    await replacePgliteFromDump(new Blob([pending.bytes], { type: "application/gzip" }));
  } catch {
    // Nur hier ist das Einspielen wirklich fehlgeschlagen.
    writeHolenFail(dataDir);
    return;
  } finally {
    clearPendingHolen(dataDir);
  }

  // Ab hier ist das Einspielen gelungen. Die Nachschritte sind Best-Effort:
  // wirft einer davon, darf die gelungene Wiederherstellung nicht als
  // „fehlgeschlagen“ gemeldet werden (stiller Fehlalarm).
  try {
    const { writeLastTafelBackupFile } = await import("./pglite-backup-stamp");
    writeLastTafelBackupFile(dataDir, pending.meta.at);
  } catch {
    /* Stempel ist kosmetisch — das Einspielen selbst ist gelungen. */
  }
  if (sqlPromise) {
    try {
      const sql = await sqlPromise;
      const restored = await restoreHolenSession(sql, pending.meta).catch(() => false);
      if (!restored) {
        const owners = await sql<{ email: string }>`
          select email from practice_users where role = ${"inhaberin"}
        `.catch(() => []);
        const hint = holenLoginEmailFromOwners(owners.map((row) => row.email));
        if (hint) writeHolenLoginEmail(dataDir, hint);
      }
    } catch {
      /* Session-Wiederaufnahme/Login-Hinweis ist Best-Effort. */
    }
  }
  clearHolenFail(dataDir);
}

/**
 * Replace the live PGLite Tafel with a `dumpDataDir("gzip")` blob.
 * File-backed dirs are renamed aside until the dump opens, then dropped.
 * Concurrent `getSql()` waits until this finishes.
 */
export async function replacePgliteFromDump(dump: Blob): Promise<void> {
  if (dbSource !== "pglite") {
    throw new Error("replacePgliteFromDump() is only available on the PGLite fallback (no DATABASE_URL)");
  }
  const { assertTafelWritable } = await import("./pglite-anzeige");
  assertTafelWritable();
  // Validate the archive before touching the live folder. A corrupt gzip can
  // otherwise create a partial replacement directory before PGlite rejects it,
  // leaving the previous Tafel unavailable despite the rollback attempt.
  const { assertPgliteRestoreGzip } = await import("./pglite-restore-fs");
  await assertPgliteRestoreGzip(dump);
  const { PGlite } = await import("@electric-sql/pglite");
  const probe = new PGlite({ loadDataDir: dump });
  try {
    await probe.waitReady;
  } finally {
    if (!probe.closed) await probe.close().catch(() => undefined);
  }
  const { resolvePgliteDataDir } = await import("./pglite-data-dir");
  const dataDir = resolvePgliteDataDir();
  const { bumpCopySeq, withCopyBusy } = await import("./pglite-copy-gate");
  const run = (globalRef.__pgliteReplaceChain__ ?? Promise.resolve())
    .catch(() => undefined)
    .then(() =>
      withCopyBusy(dataDir, async () => {
        await replacePgliteFromDumpInner(dump);
        const { clearSttCorrectionCache } = await import("./alma/llm-runtime");
        clearSttCorrectionCache();
        if (dataDir) bumpCopySeq(dataDir);
      }),
    );
  globalRef.__pgliteReplaceChain__ = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Finish DB bootstrap before the server handles traffic.
 *
 * - **PGLite** (no `DATABASE_URL`): open the data-dir (or RAM) DB and apply
 *   `migrations/*.sql`. Idempotent — concurrent callers share one promise.
 * - **Neon**: no-op (pool is created lazily on first query).
 *
 * Vite `configureServer` awaits this at dev startup; production imports of this
 * module kick it off immediately (see bottom of file).
 */
export function ensureDbReady(): Promise<void> {
  if (dbSource !== "pglite") return Promise.resolve();
  return getSql().then(() => undefined);
}

// Server-only eager start: kick PGLite bootstrap as soon as this module loads in
// Node. Client bundles never hit this path (`getSql` throws in the browser).
const globalBoot = globalThis as typeof globalThis & {
  __pgBootstrapPromise__?: Promise<void>;
};
if (typeof window === "undefined" && dbSource === "pglite") {
  globalBoot.__pgBootstrapPromise__ ??= ensureDbReady().catch((err) => {
    globalBoot.__pgBootstrapPromise__ = undefined;
    console.error("[db] PGLite bootstrap failed:", err);
    return import("./pglite-lock").then(({ isPgliteHeldError }) => {
      if (isPgliteHeldError(err)) return;
      throw err;
    });
  });
}

// AP 14 — DSGVO-Löschroutine: server-only, once per process, on start + every 24h.
// Runs on both backends (Neon and PGLite); live conversation code never imports
// ./practice/retention. See src/lib/practice/retention.ts.
if (typeof window === "undefined") {
  void import("./practice/retention").then(({ startRetentionSchedule }) => {
    startRetentionSchedule(getSql);
  });
}

// AP 45 — PMS-Bridge Hintergrund-Sync: server-only, no-op unless SILVIA_PMS_SYNC_MINUTES
// is set. Live conversation code never imports ./practice/bridge/scheduler.
if (typeof window === "undefined") {
  void import("./practice/bridge/scheduler").then(({ startBridgeScheduler }) => {
    startBridgeScheduler(process.env);
  });
}
