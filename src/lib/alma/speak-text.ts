/** Client-safe TTS text. No server imports — speak.test.ts can load this alone. */

import { IDENT_GREETING_SUFFIX } from "./identify.ts";

export const SILVIA_LANG = "de";

/**
 * Demo-Huber only. Live Tafel uses greetingFor(desk). Fester Gespraechsablauf
 * (Owner-Vorgabe, wie bei der Bank): Begruessung, dann sofort Datenabgleich.
 * scripts/homepage-greeting-audit.mjs prüft den Anfang ("Grüß Gott, Ordination Huber").
 */
export const GREETING = `Grüß Gott, Ordination Huber, Silvia am Apparat.${IDENT_GREETING_SUFFIX}`;

/** Demo-Huber only. Live preview uses voicePreviewText(shortName). */
export const SIGNATURE =
  "Grüß Gott. Ordination Huber. Silvia am Apparat. Der Kater Fritz nur in der Transportbox. Geöffnet von acht bis zwölf und von vierzehn bis achtzehn Uhr.";

/** Same cap as Telefon-Messages — a full Silvia reply, not a 520-char cut. */
export const SPEAK_TEXT_LIMIT = 1200;

export const TTS_FAIL_TOAST_ID = "sprechen-tts-fail";

/**
 * Zehn kurze, schlichte Empfangs-Saetze fuer die Huber-Demo-Vorschau
 * (Owner-Feedback: Stimme soll schlichter und oesterreichischer klingen,
 * variablere Texte statt eines einzigen fixen Satzes). Oesterreichisches
 * Hochdeutsch, kein Verkaufston, keine Ausrufezeichen, keine Superlative.
 */
export const VOICE_SAMPLES: readonly string[] = [
  "Ordination Huber, Grüß Gott. Wie kann ich Ihnen helfen?",
  "Im Jänner haben wir geänderte Öffnungszeiten.",
  "Bitte bringen Sie die Katze in der Transportbox.",
  "Von zwölf bis vierzehn Uhr ist Mittagspause.",
  "Der Nachtdienst ist unter der Notfallnummer erreichbar.",
  "Frau Doktor ist heute bis achtzehn Uhr in der Ordination.",
  "Am Stefanitag bleibt die Ordination geschlossen.",
  "Der Hund ist in der Heimtierdatenbank eingetragen.",
  "Die Ordination liegt bei der U2 Rathaus.",
  "Der nächste freie Termin ist am Donnerstag um neun Uhr.",
];

/** Pure, wraps — negative or oversized indices resolve modulo VOICE_SAMPLES.length. */
export function voiceSampleAt(i: number): string {
  const n = VOICE_SAMPLES.length;
  const idx = ((i % n) + n) % n;
  return VOICE_SAMPLES[idx] ?? "";
}

/**
 * Deutsche Regieanweisung fuer TTS-Provider, deren Request-Body ein
 * Stil-/Instructions-Feld unterstuetzt (siehe llm-runtime.ts). Schlicht,
 * oesterreichisches Hochdeutsch, kein Verkaufston, keine Uebertreibung.
 */
export const TTS_STYLE =
  "Du bist eine echte Tierarzthelferin am Empfang einer österreichischen Ordination, kein Sprachcomputer. " +
  "Sprich warm, natürlich und mit leichtem Lächeln in der Stimme, wie zu einer Stammkundin. " +
  "Österreichisches Hochdeutsch mit weicher Wiener Melodie: Jänner, Ordination, Grüß Gott. " +
  "Kein Verkaufston, keine Übertreibung, nichts vorgelesen. " +
  "Atme hörbar zwischen Sätzen, mach kleine Pausen nach Kommas und vor Zahlen, " +
  "hebe Wichtiges leicht an (Uhrzeiten, Tiernamen) und lass Satzenden ruhig absinken. " +
  "Gelassenes Sprechtempo, eher etwas langsamer als schneller.";

/** Merge a short opener ("Ja.") into the next sentence so TTS is not a click. */
export const SPEECH_CHUNK_MIN = 80;

const ZIP_DIGITS = [
  "null",
  "eins",
  "zwei",
  "drei",
  "vier",
  "fünf",
  "sechs",
  "sieben",
  "acht",
  "neun",
];

export function speakZip(zip: string) {
  return [...String(zip)].map((d) => ZIP_DIGITS[Number(d)] ?? d).join(" ");
}

export function ttsFailToast() {
  return "Silvia konnte gerade nicht sprechen. Bitte tippen oder nochmal versuchen.";
}

/**
 * Pronunciation for TTS. Never leaves `[pause]` in the string — the model
 * would otherwise speak the word. Browser plays sentence chunks instead.
 */
export function forSpeech(text: string) {
  let t = text.replace(/\s+/g, " ").trim();
  t = t
    .replace(/U2/g, "U zwei")
    .replace(/MA 6/g, "M A sechs")
    .replace(/8\.\s*Bezirk/gi, "achten Bezirk")
    .replace(/Dr\.\s*/g, "Doktor ")
    .replace(/Nr\.\s*/gi, "Nummer ")
    .replace(/\bStr\.\s+/g, "Straße ")
    .replace(/\bSt\.\s+/g, "Sankt ")
    .replace(/\+43\s*/g, "null dreiundvierzig ")
    .replace(/1080/g, "zehn achtzig")
    .replace(
      /\bPLZ\s+(\d{4})\b/gi,
      (_m, zip: string) => `Postleitzahl ${speakZip(zip)}`,
    )
    .replace(
      /\b(\d{4})\s+(?=[A-ZÄÖÜ])/g,
      (_m, zip: string) => `${speakZip(zip)} `,
    )
    .replace(/Chip\s+(\d{4})(\d{4})(\d+)/gi, "Chip $1 $2 $3")
    .replace(/€/g, " Euro")
    .replace(/%/g, " Prozent");
  t = t.replace(/\s*\[pause\]\s*/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-ZÄÖÜ„])/;

/** First sentence can start playing while later ones synthesize. */
export function speechChunks(text: string): string[] {
  const spoken = forSpeech(text).slice(0, SPEAK_TEXT_LIMIT);
  if (!spoken) return [];
  const parts = spoken
    .split(SENTENCE_SPLIT)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return [spoken];
  const chunks: string[] = [];
  let buf = "";
  for (const part of parts) {
    if (buf && buf.length + 1 + part.length <= SPEECH_CHUNK_MIN) {
      buf = `${buf} ${part}`;
      continue;
    }
    if (buf) chunks.push(buf);
    buf = part;
  }
  if (buf) chunks.push(buf);
  return chunks;
}

/** First spoken sentence plus the leftover — Gateway can POST `rest` again. */
export function speakNextChunk(text: string): { speak: string; rest: string } {
  const chunks = speechChunks(text);
  const speak = chunks[0] ?? "";
  const rest = chunks.slice(1).join(" ");
  return { speak, rest };
}
