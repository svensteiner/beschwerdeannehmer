export const DESK_DATENSCHUTZ_ID = "desk-datenschutz";
export const DESK_IMPRESSUM_ID = "desk-impressum";

/** Datenschutz — drafts only, never a Business-API claim. */
export const DATENSCHUTZ_WA =
  "WhatsApp, SMS und E-Mail öffnet die Tierarzthelferin als Entwurf (wa.me, sms:, mailto:). Es gibt keine WhatsApp-Business-API und keine SMS-Zentrale.";

export const DESK_DATENSCHUTZ_STORE_ID = "desk-datenschutz-store";

/** Live Tafel is disk/Postgres. Only the Huber sales sandbox is localStorage. */
export const DATENSCHUTZ_STORE =
  "Die Praxistafel liegt auf diesem Rechner oder dem hinterlegten Postgres. Die Verkaufs-Demo auf der Startseite speichert nur im Browser.";

/** Anzeige is a copy — not this disk, and no homepage sales demo. */
export const DATENSCHUTZ_STORE_ANZEIGE =
  "Die Praxistafel liegt auf dem Schreib-Rechner oder dem hinterlegten Postgres. Diese Anzeige ist eine Kopie. Es gibt hier keine Verkaufs-Demo im Browser.";

export function datenschutzStore(anzeige?: boolean) {
  return anzeige ? DATENSCHUTZ_STORE_ANZEIGE : DATENSCHUTZ_STORE;
}

export const IMPRESSUM_SCOPE =
  "Silvia ist eine Rezeptions- und Kommunikationssoftware für Tierarztpraxen. Sie ersetzt keine tierärztliche Untersuchung, Diagnose oder Behandlung.";

/**
 * Die Firmendaten in COMPANY sind Musterangaben (erfundene Firmenbuchnummer,
 * erfundene UID, erfundene Geschäftsführerin). § 5 ECG und § 14 UGB verlangen
 * aber echte Angaben. Der Hinweis muss sichtbar stehen, damit die Seite nicht
 * als fertiges Impressum gelesen wird.
 */
export const IMPRESSUM_MUSTER =
  "Musterangaben: Firmenbuchnummer, UID und Geschäftsführung sind Platzhalter und vor Veröffentlichung durch die echten Daten zu ersetzen. Keine Rechtsberatung.";

/** Preise FAQ — same drafts, no invented API. */
export const PREISE_FAQ_WHATSAPP =
  "Die Tierarzthelferin öffnet WhatsApp, SMS und E-Mail als Entwurf an die Halterin. Es gibt keine Business-API und keine SMS-Zentrale. Protokolle liegen auf der Tafel der Ordination.";
