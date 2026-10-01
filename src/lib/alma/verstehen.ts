/**
 * Verständnis: wie österreichische Anruferinnen am Telefon wirklich reden, für
 * den lokalen Regelpfad (localReply in ask-alma.ts). normalizeUtterance()
 * gleicht Dialekt-Verschleifungen einmal auf die hochdeutsche Form an, gegen
 * die die bestehenden Absichts-Regexe (hours.ts, desk.ts) schon prüfen –
 * kleine Ersetzungstabelle statt vieler Sonderfälle in jeder Regex. Darunter
 * die Wortlisten für Absichten, für die es noch keinen Trigger gab.
 */

/** Häufige Verschleifungen: "habts" -> "habt ihr", "kane" -> "keine", usw. */
const DIALECT_REPLACEMENTS: readonly [RegExp, string][] = [
  [/\bhabts\b/g, "habt ihr"],
  [/\bseids\b/g, "seid ihr"],
  [/\bheut\b/g, "heute"],
  [/\bis\b/g, "ist"],
  [/\bkane\b/g, "keine"],
  [/\bmitn\b/g, "mit dem"],
  [/\bgfressn\b/g, "gefressen"],
  [/\bwos\b/g, "was"],
];

/** Am Satzende: "...auch auf?" meint "...auch offen?". */
const TRAILING_AUF = /\bauf\b(?=[?!.]*\s*$)/;

/** Dialekt -> hochdeutsche Form, klein geschrieben. Nur für Absichts-Regexe, nie für Namen/Adressen. */
export function normalizeUtterance(raw: string): string {
  let t = String(raw ?? "").toLowerCase();
  for (const [pattern, replacement] of DIALECT_REPLACEMENTS) {
    t = t.replace(pattern, replacement);
  }
  return t.replace(TRAILING_AUF, "offen");
}

/** Symptom-Wörter (Dialekt inklusive), die wie termin|impfung|kastration|kontrolle|lahm einen Termin auslösen. */
export const SYMPTOM_WORDS = /speib|kotz|erbrech|durchfall|hust|humpel/;

/** Ein Anliegen, das einen Termin/Slot rechtfertigt: die alte Wortliste plus Symptome und Umgangssprache. */
export const TERMIN_TRIGGER = new RegExp(
  `termin|impfung|kastration|kontrolle|lahm|vorbeikommen|vorbeischauen|${SYMPTOM_WORDS.source}`,
);

/** Bestehenden Termin verschieben – kein neuer Slot ohne Rückfrage, siehe ask-alma.ts. */
export const RESCHEDULE_WORDS = /verschieb|umbuchen/;

/** Bestehenden Termin absagen/stornieren. */
export const CANCEL_WORDS = /absag|stornier/;

/** Anruferin verabschiedet sich: pfiat di/baba/das wars/auf Wiederhören. */
export const CLOSING_WORDS =
  /\bpfiat\b|\bbaba\b|das war'?s\b|auf wiederh(ö|oe)ren\b|auf wiedersehen\b/;

/** Vermutlich falsch verbunden. */
export const WRONG_NUMBER_WORDS = /verwählt|falsche nummer|falsch verbunden/;

/** Ganz kurze, unklare Äußerung – "Was?", "Wie bitte?", "Hä?". Auf dem rohen, ungekürzten Satz prüfen. */
const UNCLEAR_RE = /^(was|wie bitte|bitte|h[aä]+|wie)[?.]?$/i;

export function isUnclearUtterance(message: string): boolean {
  return UNCLEAR_RE.test(String(message ?? "").trim());
}

/**
 * Stabiles Teilstück der generischen Begrüßungs-Antwort (localReply's letzter
 * Zweig, ask-alma.ts) – unabhängig vom Ordinationsnamen, der davor eingesetzt
 * wird. verstehen-log.ts erkennt daran: Silvia hat nichts Konkretes verstanden.
 */
export const GENERIC_FALLBACK_MARKER =
  "Gerne helfe ich mit Termin, Öffnungszeiten oder dem Nachtdienst";

/** Exakter Text von unclearReply() (ask-alma.ts) – einmal hier, nie dupliziert. */
export const UNCLEAR_REPLY_TEXT =
  "Das habe ich nicht verstanden, sagen Sie es bitte noch einmal.";
