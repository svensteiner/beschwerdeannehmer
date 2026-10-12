/**
 * Einfache, lokale Regeln für die Beschwerdeannahme.
 * Diese Datei ist absichtlich Plain JavaScript: Kategorien und Fragen lassen
 * sich ohne Kenntnis der Server-Anbindung anpassen.
 */

/** @typedef {{ location: string, category: string, priority: string, occurredAt: string, summary: string, callback: string }} ComplaintProtocol */

/** @param {string} value @param {number} limit */
function compact(value, limit) {
  return value.trim().replace(/\s+/g, " ").slice(0, limit);
}

/** @param {string} text */
function locationFrom(text) {
  const ending = "(?=\\s+(?:hat|um|nicht|ist|war|gegen|heute|gestern|die|der|das)\\b|[,.]|$)";
  const nearby = new RegExp(`\\b(?:in|bei)\\s+(?:(?:der|die|dem|den)\\s+)?(?:garage\\s+)?([A-ZÄÖÜ][\\wÄÖÜäöüß .-]{2,50}?)${ending}`, "iu");
  const named = new RegExp(`\\b(?:garage|standort)\\s+([A-ZÄÖÜ][\\wÄÖÜäöüß .-]{2,50}?)${ending}`, "iu");
  return nearby.exec(text)?.[1]?.trim() ?? named.exec(text)?.[1]?.trim() ?? "";
}

/** @param {string} text */
function occurredAtFrom(text) {
  const match = text.match(/\b(heute|gestern|vorgestern|am\s+[A-Za-zäöüÄÖÜ]+|\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?|gegen\s+\d{1,2}(?::\d{2})?\s*(?:uhr)?)\b/iu);
  return match ? compact(match[1], 40) : "";
}

/** @param {string} text */
function callbackFrom(text) {
  const phone = text.match(/(?:\+43|00\s*43|0)\s*(?:[\d\s()/.-]{6,})/u)?.[0];
  return phone ? compact(phone, 30).replace(/[.,;:]+$/u, "") : "";
}

/** @param {ComplaintProtocol} protocol */
function nextQuestion(protocol) {
  if (!protocol.category) return "Worum geht es genau – Einfahrt, Parkticket, Abrechnung, E-Laden oder Sauberkeit und Sicherheit?";
  if (!protocol.location) return "Welche Garage oder welcher Standort ist betroffen?";
  if (!protocol.occurredAt) return "Wann war der Vorfall ungefähr?";
  if (!protocol.callback) return "Unter welcher Telefonnummer dürfen wir Sie bei Rückfragen erreichen?";
  return "Danke, das Protokoll ist vollständig. Der Betreiber kann den Vorgang jetzt prüfen.";
}

/** @param {string} text @param {ComplaintProtocol} protocol */
export function answerWithLocalRules(text, protocol) {
  const lower = text.toLocaleLowerCase("de-AT");
  const next = { ...protocol };
  if (!next.category) {
    if (/ticket|schranke|einfahrt|ausfahrt/.test(lower)) next.category = /ticket/.test(lower) ? "Parkticket oder Schranke" : "Ein-/Ausfahrt";
    else if (/laden|e-lad/.test(lower)) next.category = "E-Laden";
    else if (/abrechnung|zahlung|rechnung/.test(lower)) next.category = "Parkgebühr oder Abrechnung";
    else if (/sicher|gefahr|unfall|defekt/.test(lower)) next.category = "Sauberkeit oder Sicherheit";
  }
  if (/sicher|gefahr|unfall|defekt/.test(lower)) next.priority = "sicherheit";
  else if (/dringend|sofort|eilt|komme nicht (?:hinaus|rein)/.test(lower)) next.priority = "dringend";
  if (!next.location) next.location = locationFrom(text);
  if (!next.occurredAt) next.occurredAt = occurredAtFrom(text);
  if (!next.callback) next.callback = callbackFrom(text);
  next.summary = compact([next.summary, text].filter(Boolean).join(" "), 1000);
  return { reply: nextQuestion(next), protocol: next };
}
