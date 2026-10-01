/**
 * AP 40: Zahlen-/Uhrzeitkorrektur, portiert aus C:\silvia-voice\lib\entity_fix.py (AP 38)
 * nach TypeScript. Läuft im Transkriptionspfad, nachdem STT den Rohtext liefert und bevor
 * der Text ins Gespräch geht.
 *
 * Bewusst NICHT portiert: der Namensabgleich gegen die Kartei (correct_names in
 * entity_fix.py). Laut AP-38-Messung (siehe C:\silvia-voice\docs\stt-robustheit.md,
 * Abschnitt "Abgleich mit der Kartei") bringt er bei gpt-transcribe kaum etwas — Tiername
 * roh 78.9 % == nach Korrektur 78.9 %, weil gpt-transcribe Namen mit Fach-Prompt schon fast
 * immer richtig erkennt. Der Hebel liegt bei Zahlen: Uhrzeiten 33 % -> 58 %,
 * Telefon-/Chipnummern 0 % -> 100 % Trefferquote. Deshalb hier nur Zeit- und
 * Zahlenfolgen-Normalisierung. Reine Textverarbeitung, kein Netzwerk- oder Datenbankzugriff.
 */

const WORD_TO_NUM: Record<string, number> = {
  null: 0,
  eins: 1,
  ein: 1,
  eine: 1,
  zwei: 2,
  zwo: 2,
  drei: 3,
  vier: 4,
  "fünf": 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  "zwölf": 12,
  dreizehn: 13,
  vierzehn: 14,
  "fünfzehn": 15,
  sechzehn: 16,
  siebzehn: 17,
  achtzehn: 18,
  neunzehn: 19,
  zwanzig: 20,
  "dreißig": 30,
  vierzig: 40,
  "fünfzig": 50,
};

/** Only single-digit words (0-9) count as part of a spoken phone/chip number run. */
const ONES: Record<string, number> = Object.fromEntries(
  Object.entries(WORD_TO_NUM).filter(([, v]) => v < 10),
);

function wordToHour(word: string | undefined): number | null {
  if (!word) return null;
  const v = WORD_TO_NUM[word.toLowerCase()];
  return v === undefined ? null : v;
}

// No \b/\w here: \w in JS is ASCII-only and would split German words on
// umlauts (ü, ö, ä, ß). \p{L} (Unicode letter) needs the "u" flag instead.
const TIME_WORDS_RE =
  /(viertel|halb|dreiviertel)\s+(nach|vor)\s+([\p{L}]+)|([\p{L}]+)\s+uhr\s+([\p{L}]+)?/giu;

/**
 * Normalisiert gesprochene Uhrzeiten auf HH:MM, z.B. "viertel nach zehn" ->
 * "10:15", "vierzehn Uhr dreißig" -> "14:30". Ohne erkennbares Muster bleibt
 * der Text unverändert (inkl. bekannter Lücken wie zusammengesetzte
 * Minutenwörter — "siebzehn Uhr fünfundvierzig" bleibt unangetastet, exakt
 * wie im Python-Original).
 */
export function normalizeTimes(text: string): string {
  return text.replace(
    TIME_WORDS_RE,
    (match, frac?: string, rel?: string, hourWord?: string, hourWord2?: string, minWord?: string) => {
      if (frac && rel) {
        const hour = wordToHour(hourWord);
        if (hour === null) return match;
        const key = `${frac.toLowerCase()}|${rel.toLowerCase()}`;
        let h = hour;
        let mm = 0;
        if (key === "viertel|nach") {
          h = hour;
          mm = 15;
        } else if (key === "viertel|vor") {
          h = hour - 1;
          mm = 45;
        } else if (key === "halb|nach") {
          h = hour - 1;
          mm = 30;
        } else if (key === "dreiviertel|vor") {
          h = hour - 1;
          mm = 45;
        }
        h = ((h % 24) + 24) % 24;
        return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      }
      const hour = wordToHour(hourWord2);
      if (hour === null) return match;
      let minute = 0;
      if (minWord) {
        const m = wordToHour(minWord);
        if (m === null) return match;
        minute = m;
      }
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    },
  );
}

/**
 * Zieht Folgen deutscher Zahlwörter (Telefon-/Chipnummern, z.B. "null sechs
 * vier drei eins zwei drei vier fünf sechs") zu Ziffernfolgen zusammen.
 * Einzelne, isolierte Zahlwörter (z.B. in Uhrzeiten) werden hier nicht
 * angefasst — normalizeTimes läuft vorher. Ab drei aufeinanderfolgenden
 * Einzelziffern wird zusammengezogen (1-2 sind meist normale Sprache).
 */
export function normalizeNumberSequences(text: string): string {
  const tokens = text.split(" ");
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const run: string[] = [];
    let j = i;
    while (j < tokens.length) {
      const w = tokens[j].replace(/[,.;]+$/, "").toLowerCase();
      if (w in ONES || w === "null") {
        run.push(String(ONES[w] ?? 0));
        j++;
      } else {
        break;
      }
    }
    if (run.length >= 3) {
      out.push(run.join(""));
      i = j;
    } else {
      out.push(tokens[i]);
      i++;
    }
  }
  return out.join(" ");
}

/**
 * Wendet Zeit- und Zahlennormalisierung an, in dieser Reihenfolge (Zahlen
 * zuerst normalisiert Uhrzeiten, danach werden verbleibende Zahlwortfolgen
 * zusammengezogen) — wie apply_all() in entity_fix.py, nur ohne den
 * Namensabgleich (siehe Modulkommentar oben).
 */
export function correctNumbers(text: string): string {
  return normalizeNumberSequences(normalizeTimes(text));
}
