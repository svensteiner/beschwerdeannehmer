/**
 * Datensparsame Auswertung für Betreiber.
 *
 * Das Modul kennt bewusst keine Beschreibungen, Namen, E-Mail-Adressen oder
 * Telefonnummern. Es fasst nur Standort, Kategorie, Erstellmonat und Status
 * zusammen und verändert keine Beschwerde.
 */

const closedStatus = "geschlossen";

/** @param {unknown} value */
function monthFromCreatedAt(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new TypeError("Jede Beschwerde benötigt einen gültigen Erstellzeitpunkt.");
  }
  return value.slice(0, 7);
}

/** @param {unknown} value @param {string} field */
function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`Jede Beschwerde benötigt ${field}.`);
  }
  return value.trim();
}

/**
 * @typedef {{ location: string, category: string, createdAt: string, status: string }} ComplaintForAnalytics
 * @typedef {{ location: string, category: string, month: string, count: number, closed: number, open: number }} ComplaintAnalyticsRow
 */

/**
 * @param {ComplaintForAnalytics[]} complaints
 * @returns {ComplaintAnalyticsRow[]}
 */
export function aggregateComplaintAnalytics(complaints) {
  if (!Array.isArray(complaints)) throw new TypeError("Beschwerden müssen als Liste übergeben werden.");

  /** @type {Map<string, ComplaintAnalyticsRow>} */
  const rows = new Map();
  for (const complaint of complaints) {
    const location = requiredText(complaint?.location, "einen Standort");
    const category = requiredText(complaint?.category, "eine Kategorie");
    const month = monthFromCreatedAt(complaint?.createdAt);
    const key = `${location}\u0000${category}\u0000${month}`;
    const row = rows.get(key) ?? { location, category, month, count: 0, closed: 0, open: 0 };
    row.count += 1;
    if (complaint.status === closedStatus) row.closed += 1;
    else row.open += 1;
    rows.set(key, row);
  }

  return [...rows.values()].sort((left, right) =>
    left.location.localeCompare(right.location, "de") ||
    left.category.localeCompare(right.category, "de") ||
    left.month.localeCompare(right.month),
  );
}

/** @param {string | number} value */
function csvValue(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

/**
 * Erzeugt eine CSV-Datei ausschließlich aus anonymen Summenzeilen.
 *
 * @param {ComplaintAnalyticsRow[]} rows
 */
export function complaintAnalyticsCsv(rows) {
  if (!Array.isArray(rows)) throw new TypeError("Auswertungszeilen müssen als Liste übergeben werden.");
  const header = ["Standort", "Kategorie", "Monat", "Anzahl", "Abgeschlossen", "Offen"];
  const lines = rows.map((row) => [row.location, row.category, row.month, row.count, row.closed, row.open].map(csvValue).join(","));
  return [header.map(csvValue).join(","), ...lines].join("\r\n");
}
