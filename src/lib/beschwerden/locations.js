/**
 * Synthetische Standorte für die Demo.
 *
 * Neue Standorte werden hier mit ihrem offiziellen Namen und den üblichen
 * Bezeichnungen ergänzt. Die Gesprächslogik erhält immer den offiziellen
 * Namen zurück, damit die Betreiber-Tafel einheitlich bleibt.
 */
export const demoLocations = [
  { name: "Hauptbahnhof", aliases: ["Garage Hauptbahnhof", "Bahnhofgarage"] },
  { name: "Stadtpark", aliases: ["Garage Stadtpark", "Parkgarage Stadtpark"] },
];

/** Offizielle Namen für Eingabefelder und Auswertungen. */
export const locationNames = demoLocations.map((location) => location.name);

/** @param {string} value */
function normalize(value) {
  return value
    .toLocaleLowerCase("de-AT")
    .replace(/ä/gu, "ae")
    .replace(/ö/gu, "oe")
    .replace(/ü/gu, "ue")
    .replace(/ß/gu, "ss")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/**
 * Erkennt einen bekannten Standort in einem gesprochenen oder geschriebenen Satz.
 * Gibt bewusst nur Demo-Standorte zurück; unbekannte Orte bleiben leer.
 *
 * @param {string} text
 * @returns {string}
 */
export function knownLocationFrom(text) {
  const normalizedText = ` ${normalize(text)} `;
  for (const location of demoLocations) {
    for (const phrase of [location.name, ...location.aliases]) {
      const normalizedPhrase = normalize(phrase);
      if (normalizedPhrase && normalizedText.includes(` ${normalizedPhrase} `)) return location.name;
    }
  }
  return "";
}
