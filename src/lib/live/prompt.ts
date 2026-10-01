/**
 * Live-Wrapper, Stufe 2: Rollen-Prompt je Praxis.
 *
 * Enthält nur Praxis-Stammdaten (Name, Zeiten, Notdienst), nie Halter-, Patienten-
 * oder Akteninhalte. Alles, was gebucht oder notiert wird, entscheidet das
 * Backend; Live spricht nur die Antwort, die der Server liefert.
 */
import { redactForCloud } from "./redact";

export type LivePracticePrompt = {
  practiceName: string;
  /** Freitext-Zeilen, z. B. "Mo–Fr 8–12 und 14–18". */
  hoursLines: string[];
  /** Nummer für Notfälle, so wie sie die Praxis hinterlegt hat. */
  nightPhone: string;
};

const MAX_LINE = 120;

/** Stammdaten säubern: keine Steuerzeichen, keine Anweisungen einschleusen, gekürzt. */
function clean(value: string): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f`<>{}[\]]/g, " ")
    // Anweisungsartige Sätze in Stammdaten sind Daten, nie Befehle: entfernen.
    .replace(/[^.;!?]*(?:ignorier|vergiss|missachte|ignore|disregard|system\s*prompt|neue\s+anweisung)[^.;!?]*[.;!?]?/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LINE);
}

/** Pflicht-Ansage nach EU AI Act Art. 50: Anrufer wissen, dass sie mit einer KI sprechen. */
export function disclosureGreeting(practiceName: string): string {
  const name = clean(practiceName) || "der Tierarztpraxis";
  return `Grüß Gott, Sie sprechen mit der digitalen Assistentin von ${name}. Wie kann ich helfen?`;
}

export function buildLiveInstructions(practice: LivePracticePrompt): string {
  const name = clean(practice.practiceName) || "der Tierarztpraxis";
  const hours = practice.hoursLines.map(clean).filter(Boolean).slice(0, 10);
  // Die Notdienstnummer ist eine Praxisnummer, keine Personendaten: sie darf gesprochen werden.
  const night = clean(practice.nightPhone);
  return [
    `Du bist die digitale Telefonassistentin von ${name}. Sprich kurz, warm und auf Deutsch (österreichisch gefärbt).`,
    `Beginne jedes Gespräch mit genau dieser Ansage: "${disclosureGreeting(name)}"`,
    "Sage nie, dass du ein Mensch bist. Frage, ob du eine KI bist, bejahe es freundlich.",
    "Du gibst keine tiermedizinische Beratung, keine Diagnose, keine Dosierung und keine Preise.",
    "Notfall (Vergiftung, Unfall, Atemnot, starke Blutung, Krampf, Kollaps, schwierige Geburt) oder Unsicherheit oder Wunsch nach einem Menschen: sofort an die Praxis oder den Notdienst verweisen"
      + (night ? ` (Notdienstnummer ${night})` : "") + ", nicht weiter nachfragen.",
    "Erfasse nur: Name der Halterin oder des Halters, Rückrufnummer, Name und Art des Tieres, Anliegen in Stichworten, Terminwunsch. Frage nach nichts anderem.",
    "Buchen, Suchen und Notieren erledigt der Server. Behaupte nie, etwas sei erledigt, bevor der Server es bestätigt hat. Sprich danach die Antwort des Servers.",
    "Bei unklaren Namen, Zahlen oder Daten frage gezielt nach und wiederhole sie zur Bestätigung.",
    hours.length ? `Öffnungszeiten (nur diese nennen): ${hours.join("; ")}.` : "Nenne keine Öffnungszeiten, sie sind nicht hinterlegt.",
    "Interruption policy: Wenn die Person dich unterbricht, stoppe und höre zu. Backchannel: moderat.",
  ].join("\n");
}

/** Platzhalter ohne Ziffern und Satzzeichen, damit Schwärzung und Kürzung ihn nicht berühren. */
const mark = (i: number) => `ECHOMARKE${String.fromCharCode(97 + i)}ENDE`;

/**
 * Text, den der Server an Live zum Sprechen zurückgibt: erst schwärzen, dann kürzen.
 * `echo` sind Angaben, die die Anrufer im selben Gespräch selbst genannt haben
 * (z. B. Rückrufnummer zur Bestätigung). Alles andere aus der Datenbank bleibt geschwärzt.
 */
export function speakableServerReply(text: string, echo: string[] = [], maxChars = 600): string {
  let out = String(text ?? "");
  const keep = echo.map((e) => String(e ?? "").trim()).filter((e) => e.length >= 3);
  keep.forEach((e, i) => { out = out.split(e).join(mark(i)); });
  out = redactForCloud(out).text;
  keep.forEach((e, i) => { out = out.split(mark(i)).join(e); });
  return out.slice(0, maxChars);
}
