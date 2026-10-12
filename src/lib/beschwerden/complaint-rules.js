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
  const candidate = nearby.exec(text)?.[1]?.trim() ?? named.exec(text)?.[1]?.trim() ?? "";
  // Zeit- und Richtungsangaben sind keine Standorte. Ohne hinterlegte
  // Standortliste lassen wir sie lieber offen, als einen falschen Ort zu speichern.
  if (/\b(?:früh|morgen|mittag|abend|nacht|spät|heute|gestern|einfahrt|ausfahrt)\b/iu.test(candidate)) return "";
  return candidate;
}

/** @param {string} text */
function occurredAtFrom(text) {
  const match = text.match(/\b(heute|gestern|vorgestern|am\s+[A-Za-zäöüÄÖÜ]+|\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?|gegen\s+\d{1,2}(?::\d{2})?\s*(?:uhr)?)\b/iu);
  return match ? compact(match[1], 40) : "";
}

/** @param {string} text */
function callbackFrom(text) {
  // Ein Datum wie 10.05.2026 darf nicht als Telefonnummer enden. Danach
  // akzeptieren wir nur Nummern mit mindestens acht Ziffern.
  const withoutDates = text.replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/gu, " ");
  const matches = withoutDates.matchAll(/(?:\+43|00\s*43|0)(?:[\s()/.-]*\d){7,}/gu);
  for (const match of matches) {
    const phone = compact(match[0], 30).replace(/[.,;:]+$/u, "");
    if ((phone.match(/\d/g) ?? []).length >= 8) return phone;
  }
  return "";
}

const emergencyPattern = /\b(?:eingesperrt|eingeschlossen|komme\s+nicht\s+(?:raus|hinaus)|rauch|feuer|verletzt|unfall|person|gefahr)\b/iu;
const safetyPattern = /\b(?:sicher(?:heit|heitsrelevant)?|gefahr)\b/iu;

export const emergencyReply = "Dieser Dienst alarmiert niemanden. Bei Gefahr: 112 / 122 / 133 / 144 oder die Notruftaste bzw. Gegensprechanlage in der Garage.";

/** @param {string} text */
export function isEmergency(text) {
  return emergencyPattern.test(text);
}

/** @param {ComplaintProtocol} protocol */
function nextQuestion(protocol) {
  if (!protocol.category) return "Worum geht es genau – Einfahrt, Parkticket, Abrechnung, E-Laden oder Sauberkeit und Sicherheit?";
  if (!protocol.location) return "Welche Garage oder welcher Standort ist betroffen?";
  if (!protocol.occurredAt) return "Wann war der Vorfall ungefähr?";
  if (!protocol.callback) return "Unter welcher Telefonnummer dürfen wir Sie bei Rückfragen erreichen?";
  return "Das Protokoll ist vollständig. Der Betreiber prüft den Vorgang.";
}

/** @param {string} text @param {ComplaintProtocol} protocol */
export function updateComplaintProtocol(text, protocol) {
  const lower = text.toLocaleLowerCase("de-AT");
  const next = { ...protocol };
  if (!next.category) {
    if (/ticket|schranke|einfahrt|ausfahrt/.test(lower)) next.category = /ticket/.test(lower) ? "Parkticket oder Schranke" : "Ein-/Ausfahrt";
    else if (/laden|e-lad/.test(lower)) next.category = "E-Laden";
    else if (/abrechnung|zahlung|rechnung/.test(lower)) next.category = "Parkgebühr oder Abrechnung";
    else if (isEmergency(text) || safetyPattern.test(text)) next.category = "Sauberkeit oder Sicherheit";
  }
  if (isEmergency(text) || safetyPattern.test(text)) next.priority = "sicherheit";
  else if (/\bdefekt\b/u.test(lower) && next.priority !== "sicherheit") next.priority = "dringend";
  else if (/dringend|sofort|eilt|komme nicht (?:hinaus|rein)/.test(lower)) next.priority = "dringend";
  if (!next.location) next.location = locationFrom(text);
  if (!next.occurredAt) next.occurredAt = occurredAtFrom(text);
  if (!next.callback) next.callback = callbackFrom(text);
  next.summary = compact([next.summary, text].filter(Boolean).join(" "), 1000);
  return next;
}

/** @param {string} text @param {ComplaintProtocol} protocol */
export function answerWithLocalRules(text, protocol) {
  const next = updateComplaintProtocol(text, protocol);
  return { reply: isEmergency(text) ? emergencyReply : nextQuestion(next), protocol: next };
}
