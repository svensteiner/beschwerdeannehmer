/**
 * AP 52: Anruf-Zusammenfassung nach Gespraechsende — kurze, deutsche
 * Zusammenfassung fuer die Tafel (calls.summary) und einen E-Mail-Entwurf.
 * Rein serverseitig, nie blockierend fuer die Telefonantwort (fire-and-forget).
 */

const MAX_CHARS = 800;
const MAX_LINES = 6;

/** Deutscher Prompt: 3-5 kurze Zeilen zu Anliegen, Tier, Vereinbarung, Rueckruf. */
export function summaryPrompt(lines: string[]): string {
  const transcript = lines.slice(-40).join("\n");
  return [
    "Fasse das folgende Telefongespraech einer Tierarztpraxis in 3 bis 5 kurzen Zeilen auf Deutsch zusammen.",
    "Jede Zeile beginnt mit einem Stichwort, keine vollstaendigen Saetze, keine Einleitung.",
    "Struktur:",
    "Anliegen: <worum ging es>",
    "Tier: <Tierart/Name, falls genannt>",
    "Vereinbart: <was wurde vereinbart, oder 'offen'>",
    "Rueckruf noetig: <ja/nein>",
    "",
    "Gespraech:",
    transcript,
  ].join("\n");
}

/** Trimmt, kappt auf max 6 Zeilen und 800 Zeichen. */
export function parseSummary(text: string): string {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return "";
  const capped = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_LINES)
    .join("\n");
  return capped.slice(0, MAX_CHARS);
}

/**
 * Punkt 5 — taugt die Modellantwort als Zusammenfassung?
 *
 * Zwei Fehler waren moeglich:
 *
 *   1. Das Modell lehnt die Aufgabe ab („Ich kann das Gespraech nicht
 *      zusammenfassen“). Der Satz wurde als gueltige Zusammenfassung
 *      gespeichert.
 *   2. Ein Feldname ohne Inhalt („Tier:“) galt als Auskunft. Die Pruefung sah
 *      nur den Doppelpunkt, nicht den Wert.
 *
 * Deshalb: mindestens ein Feld MIT Inhalt, und keine Ablehnung.
 */
const SUMMARY_FIELDS = [
  // Nur HORIZONTALE Leerzeichen nach dem Doppelpunkt, dann ein Zeichen.
  // `\s` wuerde auch den Zeilenumbruch schlucken: „Tier:\nAnliegen:“ galt damit
  // als gefuellt, weil das „A“ der naechsten Zeile als Inhalt zaehlte.
  /^[^\S\r\n]*anliegen[^\S\r\n]*:[^\S\r\n]*\S/im,
  /^[^\S\r\n]*tier[^\S\r\n]*:[^\S\r\n]*\S/im,
  /^[^\S\r\n]*vereinbart[^\S\r\n]*:[^\S\r\n]*\S/im,
  /^[^\S\r\n]*rueckruf[^\S\r\n]*(?:noetig)?[^\S\r\n]*:[^\S\r\n]*\S/im,
  /^[^\S\r\n]*rückruf[^\S\r\n]*(?:nötig)?[^\S\r\n]*:[^\S\r\n]*\S/im,
];

/** Wendungen, mit denen ein Modell die Aufgabe ablehnt oder sich entschuldigt. */
const REFUSAL = [
  /\bich\s+kann\s+(?:das|dieses|die|den)\b[^.]*\bnicht\b/i,
  /\bich\s+kann\s+(?:leider\s+)?nicht\b/i,
  /\bes\s+tut\s+mir\s+leid\b/i,
  /\bich\s+habe\s+(?:keine|keinen|kein)\b[^.]*\b(?:transkript|gespraech|information)/i,
  /\bals\s+(?:ki|sprachmodell|assistent)\b/i,
  /\bich\s+benoetige\b/i,
  /\bkein\s+transkript\b/i,
];

export function isUsableSummary(text: string): boolean {
  const value = String(text ?? "").trim();
  if (!value) return false;
  if (REFUSAL.some((pattern) => pattern.test(value))) return false;
  return SUMMARY_FIELDS.some((pattern) => pattern.test(value));
}

/**
 * Punkt 8 — gespeicherte Aktion ausdruecklich auf einen Zusammenfassungsstatus
 * abbilden.
 *
 * Der Code erwartete `booked` oder `wish`, uebernahm aber ersatzweise den freien
 * Text aus `calls.action`. Damit hing das Verhalten davon ab, ob zufaellig ein
 * passendes Wort im Text stand. Hier steht die Zuordnung an einer Stelle.
 *
 * Werte aus `board.ts`: „Termin gelegt“, „Termin <Anliegen> gelegt“,
 * „Rueckrufzettel“, „An die Tierarzthelferin“, „Auskunft hinterlegt“,
 * „Tafelkonflikt: …“. Ein Terminwunsch kommt als „Terminwunsch“.
 */
export type SummaryAgreementKind = "booked" | "wish" | "callback" | "transfer" | "conflict" | "none";

export function mapAgreementKind(action: string | null | undefined): SummaryAgreementKind {
  const value = String(action ?? "").trim();
  if (!value) return "none";
  // Bereits zugeordnete Namen unveraendert durchreichen. Sonst wuerde ein
  // zweiter Durchlauf „callback“ wieder zu „none“ machen.
  if (/^(?:booked|wish|callback|transfer|conflict|none)$/i.test(value)) {
    return value.toLowerCase() as SummaryAgreementKind;
  }
  if (/^wish$/i.test(value)) return "wish";
  // „Termin gelegt“ und „Termin <Anliegen> gelegt“ sind bestaetigte Buchungen.
  if (/^termin\b.*\bgelegt$/i.test(value)) return "booked";
  // „Terminwunsch“ ist EIN Wort: `\bwunsch\b` faende darin keine Grenze.
  if (/wunsch/i.test(value)) return "wish";
  // Vor „gelegt“ pruefen: „Rueckrufzettel“ ist keine Buchung.
  if (/\br(?:ü|ue)ckruf/i.test(value)) return "callback";
  if (/\b(?:kassa|tierarzthelferin)\b/i.test(value)) return "transfer";
  // „Tafelkonflikt“ ist ebenfalls EIN Wort.
  if (/konflikt/i.test(value)) return "conflict";
  if (/^termin$/i.test(value)) return "booked";
  return "none";
}

/** Wendungen, die eine feste Zusage behaupten — sie werden entfernt. */
const CONFIRMED_WORDS =
  /\b(?:fix|fest(?:gelegt|gemacht)?|bestaetigt|bestätigt|gebucht|eingetragen|reserviert|zugesagt)\b/gi;

/** Eine Vereinbarungszeile sieht nach einem TERMIN aus. */
const APPOINTMENT_LIKE =
  /\b(?:termin|uhr|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|morgen|heute|übermorgen|uebermorgen|\d{1,2}\s*[.:]\s*\d{2})\b/i;

/** Eine Vereinbarungszeile sieht nach einem RUECKRUF aus. */
const CALLBACK_LIKE = /\br(?:ü|ue)ckruf|\bzur(?:ü|ue)ckruf|\banrufen\b|\bmeldet\b|\brufe\b/i;

function stripConfirmedWords(value: string): string {
  return value
    .replace(CONFIRMED_WORDS, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

/**
 * Punkte 6 und 7 — Vereinbarungen an der tatsaechlich gespeicherten Aktion
 * ausrichten.
 *
 * Das Modell kennt nur das Gespraech, nicht den Datenbankstand. Sagt es
 * „Vereinbart: Termin morgen um 15 Uhr“, waehrend die Tafel den Termin nur
 * VORGEMERKT hat, behauptet die Zusammenfassung mehr als passiert ist. Die
 * Helferin liest sie als Tatsache.
 *
 * Zwei Regeln, die vorher fehlten:
 *
 *   - Punkt 6: Es genuegt NICHT, auf Schluesselwoerter zu warten. Jede
 *     terminbezogene Vereinbarung wird bei `wish` als unbestätigt und bei
 *     `none` als nicht gebucht gekennzeichnet. Der Inhalt bleibt erhalten,
 *     nur die Zusage faellt weg.
 *   - Punkt 7: Andere Vereinbarungen bleiben unangetastet. „Rueckruf zugesagt“
 *     ist keine Terminzusage und wurde vorher zu „offen“ geloescht.
 */
export function alignSummaryAgreement(
  summary: string,
  agreement: SummaryAgreementKind | string | null | undefined,
  wishesVisible = true,
): string {
  const value = String(summary ?? "");
  if (!value) return value;
  const kind = mapAgreementKind(agreement);
  // Eine bestaetigt gebuchte Aktion darf stehen bleiben.
  if (kind === "booked") return value;
  // Rueckruf, Uebergabe und Konflikt sind keine Terminzusagen.
  if (kind === "callback" || kind === "transfer" || kind === "conflict") return value;

  const line = /^\s*vereinbart\s*:\s*(.*)$/im;
  const match = line.exec(value);
  if (!match) return value;
  // Nur den WERT pruefen, nicht das Feldwort: „Vereinbart: offen“ enthaelt
  // selbst das Wort „vereinbart“ und gaelte sonst faelschlich als Zusage.
  const original = match[1]!.trim();
  if (!original) return value;
  // Ohne Terminbezug bleibt die Zeile stehen: Punkt 7.
  if (!APPOINTMENT_LIKE.test(original)) return value;
  // Ein reiner Rueckruf mit Terminwort bleibt ebenfalls stehen.
  if (CALLBACK_LIKE.test(original)) return value;

  const cleaned = stripConfirmedWords(original);
  const base = cleaned || "offen";
  const qualifier = kind === "wish" && wishesVisible
    ? "vorgemerkt, noch nicht bestaetigt"
    : "nicht gebucht";
  // Nur den Wert ersetzen; das Feldwort bleibt stehen.
  return value.replace(/^(\s*vereinbart\s*:\s*).*$/im, `$1${base} (${qualifier})`);
}
/**
 * Punkt 7 — Zeitangabe ausdruecklich in Wiener Zeit.
 *
 * `new Date()` liefert die Serverzeit; mit den Methoden `getHours()` und
 * `getMinutes()` landete die Zeitzone des Servers im Betreff. Laeuft der Server
 * in UTC oder auf einem Rechner mit anderer Zeitzone, stand dort eine falsche
 * Uhrzeit — und die Helferin sucht den Entwurf nach dem Gespraech.
 */
export function viennaStamp(date: Date, timeZone = "Europe/Vienna"): string {
  const parts = new Intl.DateTimeFormat("de-AT", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`;
}

/**
 * Betreff des Zusammenfassungs-Entwurfs.
 *
 * Punkt 8: Die Anrufkennung steht zusaetzlich in einer eigenen Spalte
 * (`mails.call_id`). Sie bleibt im Betreff, damit Menschen den Entwurf dem
 * Anruf zuordnen koennen.
 */
export function summaryMailSubject(date: Date, callId: string, timeZone = "Europe/Vienna"): string {
  const id = String(callId ?? "").trim();
  const suffix = id ? ` [${id}]` : "";
  return `Anrufzusammenfassung ${viennaStamp(date, timeZone)}${suffix}`;
}

/**
 * Erzeugt die Zusammenfassung ueber die uebergebene llm-Funktion. Wirft nie —
 * bei fehlendem Transkript, LLM-Fehler, unbrauchbarer Antwort (Punkt 5) oder
 * leerer Antwort kommt "" zurueck, damit ein Aufrufer im Hintergrund nie eine
 * unbehandelte Exception ausloest.
 *
 * `agreement` richtet die Vereinbarungszeile an der tatsaechlich gespeicherten
 * Aktion aus (Punkt 6).
 */
export async function summarizeCall(deps: {
  llm: (prompt: string) => Promise<string>;
  lines: string[];
  agreement?: SummaryAgreementKind | null;
}): Promise<string> {
  try {
    const lines = Array.isArray(deps.lines) ? deps.lines.filter((l) => String(l ?? "").trim()) : [];
    if (lines.length === 0) return "";
    const raw = await deps.llm(summaryPrompt(lines));
    const parsed = parseSummary(raw);
    // Punkt 5: eine Ablehnung des Modells ist keine Zusammenfassung.
    if (!isUsableSummary(parsed)) return "";
    return alignSummaryAgreement(parsed, deps.agreement ?? null);
  } catch {
    return "";
  }
}
