/**
 * Übersetzt einfache Zeitangaben aus einem Beschwerdegespräch in ein Datum.
 * Diese Datei arbeitet bewusst ohne Pakete: Sie kennt nur Kalenderdaten und
 * nutzt für die Umrechnung immer die Zeitzone Europe/Vienna.
 */

const viennaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Vienna",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** @param {Date} value */
function viennaCalendarDate(value) {
  const parts = viennaDateFormatter.formatToParts(value);
  const values = Object.fromEntries(parts.filter(({ type }) => type !== "literal").map(({ type, value: part }) => [type, part]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

/** @param {number} year @param {number} month @param {number} day */
function isoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return date.toISOString().slice(0, 10);
}

/** @param {{ year: number, month: number, day: number }} date @param {number} days */
function addCalendarDays(date, days) {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return isoDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/**
 * @param {string} text Gesprächsabschnitt mit einer Zeitangabe
 * @param {{ now?: Date }} [options] Der Testzeitpunkt; im Betrieb bleibt er leer.
 * @returns {{ isoDate: string, originalText: string } | null}
 */
export function normalizeComplaintTime(text, options = {}) {
  const now = options.now ?? new Date();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError("now muss ein gültiges Datum sein");

  const relative = /\b(heute|gestern|vorgestern)\b/iu.exec(text);
  if (relative) {
    const word = relative[1].toLocaleLowerCase("de-AT");
    const days = word === "heute" ? 0 : word === "gestern" ? -1 : -2;
    const date = viennaCalendarDate(now);
    return { isoDate: addCalendarDays(date, days), originalText: relative[1] };
  }

  const absolute = /\b(\d{2})\.(\d{2})\.(\d{4})\b/u.exec(text);
  if (!absolute) return null;
  const [, day, month, year] = absolute;
  const normalized = isoDate(Number(year), Number(month), Number(day));
  return normalized ? { isoDate: normalized, originalText: absolute[0] } : null;
}
