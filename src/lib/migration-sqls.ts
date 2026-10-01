/**
 * PGLite-Migrationsquelle — getrennt von `db.server.ts`, damit ein Test die
 * Quelle ersetzen kann, BEVOR der eager Bootstrap der Datenbank läuft.
 *
 * `import.meta.glob` ist ein Vite-Transform, das `tsx` nicht auswerten kann.
 * In Produktion (Vite) liefert `loadMigrationSqls()` deshalb immer die echten
 * Migrationsdateien; ein Test setzt über `setMigrationSqlsForTest` eine eigene
 * Karte (z. B. leer), ohne dass `import.meta.glob` je aufgerufen wird.
 */
let override: Record<string, string> | undefined;

export function setMigrationSqlsForTest(sqls?: Record<string, string>) {
  override = sqls;
}

export function loadMigrationSqls(): Record<string, string> {
  if (override) return override;
  return import.meta.glob("/migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
}
