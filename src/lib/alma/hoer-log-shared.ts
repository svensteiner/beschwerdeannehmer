/** Browser-sichere Konstanten und Prüfungen für Hörkorrekturen. */

/** Maximale Zahl gespeicherter Korrekturen je Praxis. */
export const HOER_LOG_CAP = 2000;

function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nur echte, nicht-leere Änderungen als Korrektur übernehmen. */
export function isMeaningfulCorrection(heard: string, corrected: string): boolean {
  const h = String(heard ?? "");
  const c = String(corrected ?? "");
  if (!normalizeForCompare(c)) return false;
  return normalizeForCompare(h) !== normalizeForCompare(c);
}
