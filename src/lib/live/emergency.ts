/**
 * Notfall-Erkennung für die Live-Leitung.
 * Deliberat über-empfindlich (false positive OK, false negative NICHT OK).
 * Normalisiert Umlaute, Groß-/Kleinschreibung und ß.
 */

function normalizeForEmergency(text: string): string {
  // ß -> ss, Umlaute, Leerzeichen trimmen
  return String(text ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ö/g, "o")
    .replace(/ä/g, "a")
    .replace(/ü/g, "u")
    .trim();
}

/** Erkennt Negation unmittelbar vor oder kurz vor Schlüsselwörtern. */
function hasNegationBefore(normalized: string, keyword: string): boolean {
  // Suche nach "kein/nicht/keine" unmittelbar vor dem Keyword
  const patterns = [
    new RegExp(`\\bkeine?n?\\s+${keyword.replace(/\s+/g, "\\s+")}`),
    new RegExp(`\\bnicht\\s+${keyword.replace(/\s+/g, "\\s+")}`),
    new RegExp(`\\bkein\\s+${keyword.replace(/\s+/g, "\\s+")}`),
  ];
  return patterns.some((p) => p.test(normalized));
}

export interface EmergencyResult {
  emergency: boolean;
  category?:
    | "vergiftung"
    | "unfall"
    | "atemnot"
    | "geburt"
    | "blutung"
    | "krampf"
    | "kollaps"
    | "hitzschlag";
  matched?: string;
}

export function detectEmergency(text: string): EmergencyResult {
  const normalized = normalizeForEmergency(text);

  // Kategorien mit Phrases und Synonymen
  const categories = {
    vergiftung: [
      "gift",
      "vergift",
      "rattengift",
      "schokolade",
      "chocolate",
      "schlangenbiss",
      "stachel",
      "gestochenen",
    ],
    atemnot: [
      "atem",
      "atmet nicht",
      "atmung",
      "keine luft",
      "luftnot",
      "nach luft",
      "schnauf",
      "roechel",
      "keuchend",
      "atemlos",
      "bekommt keine luft",
    ],
    blutung: ["blutung", "blutet", "blutend", "viel blut", "blutig", "blut erbrochen", "blut im"],
    krampf: [
      "krampf",
      "krampfanfall",
      "krampft",
      "krampfend",
      "zuckung",
      "krampfanfaelle",
    ],
    unfall: [
      "unfall",
      "autounfall",
      "vom auto",
      "auto angefahren",
      "ueberfahren",
      "uberfahren",
      "bisswunde",
      "gebissen",
      "hund gebissen",
      "verletzt",
      "trauma",
      "angefahren",
      "angerannt",
      "quetsching",
      "gebrochen",
    ],
    kollaps: [
      "kollaps",
      "bewusstlos",
      "ohnmaechtig",
      "kippt",
      "kippt um",
      "umfaellt",
      "reisst die augen auf",
      "leblos",
    ],
    geburt: [
      "wirft junge",
      "wirft welpen",
      "wirft kaetzchen",
      "wirft katzenbabys",
      "welpen kommen",
      "kriegt welpen",
      "bekommt welpen",
      "schwere geburt",
      "schwergeburt",
      "in der geburt",
      "geburt hat begonnen",
      "wehen",
      "geburtshelfer",
      "wehenschmerz",
    ],
    hitzschlag: [
      "hitzschlag",
      "hitzschock",
      "hyperthermie",
      "sonnenstich",
      "ueberhitztung",
    ],
  };

  // Schlüsselwörter für offensichtliche Notfälle (Negation-tolerant)
  const obviousEmergencyKeywords = [
    "notfall",
    "akut",
  ];

  // Check obvious keywords first
  for (const kw of obviousEmergencyKeywords) {
    if (new RegExp(`\\b${kw}\\b`).test(normalized)) {
      if (!hasNegationBefore(normalized, kw)) {
        return { emergency: true, matched: "obvious" };
      }
    }
  }

  // Kategorie-basierte Erkennung: simple substring match mit Negation-Check
  for (const [category, phrases] of Object.entries(categories)) {
    for (const phrase of phrases) {
      // Substring match, not word boundary (tolerates partial word matches)
      if (normalized.includes(phrase)) {
        // Negation-Check
        if (!hasNegationBefore(normalized, phrase)) {
          return {
            emergency: true,
            category: category as EmergencyResult["category"],
            matched: phrase,
          };
        }
      }
    }
  }

  return { emergency: false };
}
