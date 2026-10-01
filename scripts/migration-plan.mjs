// @ts-check
/**
 * Migration bookkeeping shared by the two appliers — `scripts/migrate.mjs`
 * (deploy, `readdir`) and `src/lib/db.ts` (PGLite preview, `import.meta.glob`).
 *
 * Applied files are keyed by BASENAME, so the same file applies once no matter
 * which directory it is globbed from. That is what makes the auth schema safe to
 * copy from `migrations/auth/` into `migrations/` when an app turns sign-in on:
 * a database that already has `0001_auth.sql` will not re-run it.
 *
 * Neither applier descends into subdirectories, so `migrations/auth/*.sql` is
 * out of scope for both until it is copied up.
 */

/**
 * The `_migrations` key for a migration path (or bare filename).
 * @param {string} path
 * @returns {string}
 */
export function migrationName(path) {
  return path.split("/").pop() ?? path;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isMigrationFile(path) {
  return path.endsWith(".sql");
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order.
 * Non-`.sql` entries (a `readdir` also yields `migrations/auth/`) are dropped.
 * @param {Iterable<string>} paths
 * @param {Iterable<string>} applied
 * @returns {Array<{ name: string, path: string }>}
 */
export function pendingMigrations(paths, applied) {
  const done = new Set(applied);
  return [...paths]
    .filter(isMigrationFile)
    .map((path) => ({ name: migrationName(path), path }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(({ name }) => !done.has(name));
}

/**
 * Reject a database created by a newer/different app version before any
 * pending SQL is applied. Applied names are deliberately compared with the
 * current app's migration basenames, including migrations that are not yet
 * pending in this process.
 *
 * @param {Iterable<string>} paths
 * @param {Iterable<string>} applied
 * @returns {void}
 */
export function assertAppliedMigrationsKnown(paths, applied) {
  const known = new Set(
    [...paths].filter(isMigrationFile).map((path) => migrationName(path)),
  );
  const unknown = [...new Set(applied)].filter((name) => !known.has(name)).sort();
  if (unknown.length === 0) return;

  throw new Error(
    "Die Datenbank passt nicht zu dieser App-Version (neuere oder abweichende Migrationen). Bitte die passende App-Version verwenden. Eine ältere Sicherung nur zusammen mit der zugehörigen Version getrennt wiederherstellen; keine Migrationseinträge löschen.",
  );
}
