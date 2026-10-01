/**
 * Server-only bridge for persisted speech corrections.
 *
 * Keep database/filesystem imports out of the shared llm-runtime module so
 * browser bundles never pull PGlite or the hearing log into the client.
 */
export async function readRecentHoerKorrekturen(
  practiceId: string,
): Promise<string[]> {
  const { getSql } = await import("@/lib/db.server");
  const {
    correctedPhrasesFromDb,
    hoerLogPath,
    importLegacyHoerKorrekturen,
  } = await import("./hoer-log.ts");
  const sql = await getSql();
  await importLegacyHoerKorrekturen(sql, hoerLogPath());
  return correctedPhrasesFromDb(sql, practiceId);
}
