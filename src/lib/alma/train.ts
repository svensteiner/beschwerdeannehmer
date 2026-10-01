export const TRAIN_GREETING =
  "Grüß Gott. Ich bin Silvia – schulen Sie mich. Was soll ich wissen, und wie soll ich die Klientel begrüßen?";

export type TrainingKind = "wissen" | "sprache";

export const TRAIN_PROMPTS = [
  "Mittwoch nur Kastrationen.",
  "Fritz darf nur in der Transportbox fahren.",
  "Keine neuen Katzen vor 14:30.",
  "Bei der Begrüßung sagen Sie: Grüß Gott, Tierordination Huber.",
];

/** Live Schulung chips — never Fritz, never an invented Nachtdienst. */
export const LIVE_TRAIN_PROMPTS = [
  "Mittwoch nur Kastrationen.",
  "Keine neuen Katzen vor 14:30.",
  "Parken hinter dem Haus.",
  "Bei der Begrüßung sagen Sie: Grüß Gott, Tierordination.",
];

export const SPEECH_TRAIN_PROMPTS = [
  "FIP",
  "MRT",
  "Kastration",
  "Ovariohysterektomie",
];

export function trainPromptsFor(
  live: boolean,
  kind: TrainingKind = "wissen",
) {
  if (kind === "sprache") return SPEECH_TRAIN_PROMPTS;
  return live ? LIVE_TRAIN_PROMPTS : TRAIN_PROMPTS;
}

/** Heute emptiness chips — same live prompts, no Parken (that is `#heute-parkplatz`). */
export function heuteTrainPrompts() {
  return LIVE_TRAIN_PROMPTS.filter((p) => !/^Parken /i.test(p));
}

export function heuteFactChipId(fact: string) {
  const t = fact.trim();
  if (/kastration/i.test(t)) return "heute-fakt-kastrationen";
  if (/katzen/i.test(t)) return "heute-fakt-katzen";
  if (/impfung/i.test(t)) return "heute-fakt-impfungen";
  return "";
}

export function trainGreetingFor(name?: string) {
  if (!name) return TRAIN_GREETING;
  return `Grüß Gott, ${name}. Ich bin Silvia – schulen Sie mich. Was soll ich wissen, und wie soll ich die Klientel begrüßen?`;
}

export function trainingKindFromSearch(value: unknown): TrainingKind {
  return value === "sprache" ? "sprache" : "wissen";
}

export function trainingGreetingFor(kind: TrainingKind, name?: string) {
  if (kind === "sprache") {
    return name
      ? `Grüß Gott, ${name}. Ich bin Silvia – sprechen Sie einen Fachbegriff. Wir prüfen, wie ich ihn erkenne. Bei Bedarf können Sie ihn danach korrigieren.`
      : "Grüß Gott. Ich bin Silvia – sprechen Sie einen Fachbegriff. Wir prüfen, wie ich ihn erkenne. Bei Bedarf können Sie ihn danach korrigieren.";
  }
  return trainGreetingFor(name);
}

export function extractTrainFact(message: string) {
  return message
    .replace(/^(silvia[,.]?\s*)+/i, "")
    .replace(
      /^(merk dir|merke dir|notiere|ab sofort|ab jetzt|lerne|lern):?\s*/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

/** Dedicated speech training never turns a spoken term into practice knowledge. */
export function isSpeechRecognitionTrainingInput(
  kind: "wissen" | "sprache",
  origin: "speech" | "typed",
): boolean {
  return kind === "sprache" && origin === "speech";
}

export function formatLearnedFacts(facts: string[]) {
  const clean = facts
    .map((f) => f.trim())
    .filter(Boolean)
    .slice(0, 40);
  if (!clean.length) return "";
  return `Gelerntes der Ordination (gilt vor allgemeinen Annahmen):\n${clean.map((f) => `- ${f}`).join("\n")}`;
}

/** Live system prompt: settings `#notes` rank with practice_facts, never a loose leftover paragraph. */
export function learnedPromptBlock(
  facts: string[] = [],
  notes?: string | null,
) {
  const learned = learnedFactsFrom(facts, notes);
  if (hasLearnedFactConflict(learned)) {
    return "Interner Hinweis: Zu einer Ordinationsregel liegen widersprüchliche Hinweise vor. Behaupte dazu nichts und frage nach der aktuell geltenden Regel.";
  }
  return formatLearnedFacts(learned);
}

/** Settings `#notes` counts as a Hausregel. Heute and the live fallback share this list. */
export function learnedFactsFrom(facts: string[] = [], notes?: string | null) {
  const clean = facts.map((f) => f.trim()).filter(Boolean);
  const note = String(notes ?? "")
    .trim()
    .slice(0, 400);
  if (!note) return clean.slice(0, 40);
  if (clean.some((f) => f.toLowerCase() === note.toLowerCase()))
    return clean.slice(0, 40);
  return [note, ...clean].slice(0, 40);
}

const MATCHING_FUNCTION_WORDS = new Set([
  "aber", "auch", "dann", "dass", "dem", "den", "der", "des", "die", "ein", "eine", "einem", "einen", "einer", "eines", "er", "es", "für", "haben", "habt", "hat", "heute", "ich", "ihr", "im", "in", "ist", "mit", "nicht", "sie", "sind", "und", "uns", "wir", "zu",
]);

function tokens(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-zäöüß0-9]+/)
    .filter((w) => w.length >= 4 && !MATCHING_FUNCTION_WORDS.has(w));
}

export function factsMatchingQuery(message: string, facts: string[]) {
  const t = message.toLowerCase();
  const qTokens = tokens(t);
  return facts.filter((fact) => {
    const f = fact.toLowerCase();
    return tokens(f).some((w) => {
      const stem = w.length > 6 ? w.slice(0, Math.max(4, w.length - 2)) : w;
      return (
        t.includes(w) ||
        qTokens.some((q) => q.includes(stem) || stem.includes(q))
      );
    });
  });
}

// "erlaubt" is intentionally not a negation marker; only explicit prohibitions
// may flip the conservative polarity used for conflict detection.
const NEGATION_MARKERS = /\b(kein(?:e[mnrs]?)?|nicht|nie|niemals|geschlossen|verboten|untersagt)\b/i;
const WEEKDAYS = /\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)s?\b/i;
const CLOCK_TIMES = /\b\d{1,2}(?::\d{2})?\s*(?:uhr)?\b/gi;

/**
 * Conservative check for two stored statements that cannot safely be read
 * together. It only considers an explicit negation paired with the same
 * subject/time context; compatible restrictions stay alone.
 */
export function hasLearnedFactConflict(facts: string[]) {
  const statements = facts.map((fact) => ({
    fact,
    words: new Set(tokens(fact)),
    negated: NEGATION_MARKERS.test(fact),
  }));
  for (let i = 0; i < statements.length; i += 1) {
    for (let j = i + 1; j < statements.length; j += 1) {
      const a = statements[i];
      const b = statements[j];
      if (a.negated === b.negated) continue;
      const shared = [...a.words].filter((word) => b.words.has(word));
      if (shared.length < 2) continue;
      const dayA = a.fact.match(WEEKDAYS)?.[1]?.toLowerCase();
      const dayB = b.fact.match(WEEKDAYS)?.[1]?.toLowerCase();
      if (dayA && dayB && dayA !== dayB) continue;
      const timesA = a.fact.match(CLOCK_TIMES) ?? [];
      const timesB = b.fact.match(CLOCK_TIMES) ?? [];
      if (timesA.length && timesB.length && timesA.join(" ") !== timesB.join(" ")) continue;
      return true;
    }
  }
  return false;
}

export function replyFromLearnedFacts(message: string, facts: string[]) {
  const clean = facts.map((f) => f.trim()).filter(Boolean);
  if (!clean.length) return null;
  const hits = factsMatchingQuery(message, clean);
  const t = message.toLowerCase();
  const askAll =
    /was gilt|welche regel|gemerkt|weisst du noch|weißt du noch/.test(t);
  const use = hits.length ? hits : askAll ? clean.slice(0, 3) : [];
  if (!use.length) return null;
  if (hasLearnedFactConflict(use)) {
    return "Dazu liegen widersprüchliche Hinweise vor. Welche Regel gilt aktuell?";
  }
  return `Dazu gilt bei uns: ${use.join(" ")} Soll ich Ihnen einen Termin legen?`;
}

/** Hinterlegte Hausregel/Fakt is a Tafel rule — skip the model. Schulung stays on the model. */
export function learnedFactsSkipsLlm(input: {
  message: string;
  train?: boolean;
  facts?: string[];
  notes?: string | null;
}) {
  if (input.train) return false;
  return Boolean(
    replyFromLearnedFacts(
      input.message,
      learnedFactsFrom(input.facts ?? [], input.notes),
    ),
  );
}
