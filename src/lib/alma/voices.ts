/**
 * Owner-Feedback ("Die Unterschiede zwischen den Stimmen sind minimal, da
 * muss mehr kommen."): die vier Stimmen muessen klar unterscheidbar klingen —
 * Tempo, Tonlage und Sprechstil je Stimme deutlich auseinandergezogen, nicht
 * nur homoeopathische Nuancen. xAI (Live-Provider) bietet keine
 * Akzent-/Dialekt-Steuerung (siehe llm-runtime.ts, TTS_LANGUAGE_AT-Kommentar)
 * — `speed` bleibt daher der wichtigste Hebel provider-uebergreifend, `style`
 * steuert zusaetzlich `instructions` bei Providern, die das unterstuetzen
 * (siehe llm-runtime.ts), `pitch` ist ein Hinweis fuer Provider, die eine
 * Tonlagen-Steuerung anbieten. Alles oesterreichisches Hochdeutsch.
 */
export const VOICES = [
  {
    id: "ara",
    label: "Warm",
    note: "Warmer Ton, gemäßigtes Tempo",
    speed: 0.98,
    pitch: 1.0,
    style:
      "Warm und freundlich, wie die erfahrene Tierarzthelferin am Empfang.",
  },
  {
    id: "carina",
    label: "Ruhig",
    note: "Tiefer, langsameres Tempo",
    speed: 0.9,
    pitch: 0.92,
    style: "Weich und ruhig, nimmt sich Zeit, mit tieferer Stimmlage.",
  },
  {
    id: "liora",
    label: "Klar",
    note: "Heller, schnelleres Tempo",
    speed: 1.05,
    pitch: 1.08,
    style: "Klar und sachlich, etwas schneller, mit hellerer Stimmlage.",
  },
  {
    id: "luna",
    label: "Sanft",
    note: "Sanfter Ton, langsames Tempo",
    speed: 0.85,
    pitch: 0.95,
    style: "Sanft und leise, beruhigend, mit langsamem Sprechtempo.",
  },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

export const DEFAULT_VOICE: VoiceId = "ara";

export function isVoiceId(id: string): id is VoiceId {
  return VOICES.some((v) => v.id === id);
}

export function voiceSpeed(id: VoiceId) {
  return VOICES.find((v) => v.id === id)?.speed ?? 0.93;
}

/** Pitch-Hinweis (0.9-1.1) fuer Provider, die Tonlage steuern koennen. */
export function voicePitch(id: VoiceId) {
  return VOICES.find((v) => v.id === id)?.pitch ?? 1.0;
}

/** Deutsche Stilbeschreibung fuer TTS-`instructions` (siehe llm-runtime.ts). */
export function voiceStyle(id: VoiceId) {
  return VOICES.find((v) => v.id === id)?.style ?? "";
}

export function greetingSrc(id: VoiceId) {
  return `/sounds/voices/${id}.mp3`;
}

export function signatureSrc(id: VoiceId) {
  return `/sounds/voices/${id}-signatur.mp3`;
}

/** Live Stimme-Vorschau. Empty means the Huber demo MP3. Never put Huber here for a tenant. */
export function voicePreviewText(shortName?: string) {
  const name = String(shortName ?? "")
    .trim()
    .slice(0, 80);
  if (!name) return "";
  return `Grüß Gott, ${name}. Silvia am Apparat.`;
}
