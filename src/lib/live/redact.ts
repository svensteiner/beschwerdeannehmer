// Redaktion von PII für Cloud-Versand.

/**
 * Redaktiert PII aus Text: E-Mails, AT/DE-Nummern, IBAN, Chips, SVN.
 * Idempotent, wirft nie.
 */
export function redactForCloud(text: string): { text: string; redactions: number } {
  if (typeof text !== "string") return { text: "", redactions: 0 };

  let redactions = 0;
  let result = text;

  // E-Mail: name@domain.tld (auch mit Umlauten)
  const emailRegex = /\b[^\s@]+@[^\s@]+\.[^\s@.]+\b/g;
  const emailMatches = result.match(emailRegex);
  if (emailMatches) {
    redactions += emailMatches.length;
    result = result.replace(emailRegex, "[E-Mail]");
  }

  // Handy 06 mit mindestens 7 ziffern nach 06
  const handyRegex = /(?:\+43\s*\(?0?\)?|0043|\b0)[\s\-\/()]*6(?:[\s\-\/()]*\d){7,}/g;
  const handyMatches = result.match(handyRegex);
  if (handyMatches) {
    redactions += handyMatches.length;
    result = result.replace(handyRegex, "[Nummer]");
  }

  // Festnetz: +43, 0043, oder 01/0316/0512 etc mit mindestens 7 ziffern gesamt
  const festnetzRegex = /(?:\+43|0043)\s*\(?0?\)?(?:[\s\-\/()]*\d){7,}|\b0[1-5](?:[\s\-\/()]*\d){7,}/g;
  const festnetzMatches = result.match(festnetzRegex);
  if (festnetzMatches) {
    redactions += festnetzMatches.length;
    result = result.replace(festnetzRegex, "[Nummer]");
  }

  // IBAN: AT/DE + 16–18 alphanumerisch
  const ibanRegex = /\b[A-Z]{2}\s?\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g;
  const ibanMatches = result.match(ibanRegex);
  if (ibanMatches) {
    redactions += ibanMatches.length;
    result = result.replace(ibanRegex, "[IBAN]");
  }

  // Chip: genau 15 Ziffern
  const chipRegex = /\b\d{15}\b/g;
  const chipMatches = result.match(chipRegex);
  if (chipMatches) {
    redactions += chipMatches.length;
    result = result.replace(chipRegex, "[Chip]");
  }

  // Sozialversicherungsnummer: 10 Ziffern (aber nicht als Teil längerer Zahlen)
  const svnRegex = /\b\d{10}\b/g;
  const svnMatches = result.match(svnRegex);
  if (svnMatches) {
    redactions += svnMatches.length;
    result = result.replace(svnRegex, "[Nummer]");
  }

  return { text: result, redactions };
}

/**
 * Prüft, ob Text PII enthält.
 */
export function containsPii(text: string): boolean {
  if (typeof text !== "string") return false;
  const { redactions } = redactForCloud(text);
  return redactions > 0;
}
