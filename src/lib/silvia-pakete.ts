export type SilviaPaket = {
  id: "premium" | "live";
  name: string;
  description: string;
  status: string;
  usageNotice?: string;
  features: readonly string[];
  audioSrc: string;
};

/** Gemeinsame, öffentliche Pakettexte für Preise und die Varianten-Hörproben. */
export const SILVIA_PAKETE: readonly SilviaPaket[] = [
  {
    id: "premium",
    name: "Silvia Premium",
    description: "Warme weibliche Stimme · lokal",
    status: "Demo verfügbar · lokal erzeugte Stimme · vorbereiteter Beispieltext",
    features: [
      "Praxiswissen und Begrüßung trainieren",
      "Gespräch führen und Missverständnisse korrigieren",
    ],
    audioSrc: "/sounds/voices/silvia-premium-ramona.wav",
  },
  {
    id: "live",
    name: "Silvia Live",
    description: "GPT-Live-1 mit Marin · separate Demo",
    status: "Hörprobe: Marin-Stimme · interaktive Demo nur isoliert und mit Freigabe.",
    usageNotice: "Live ist derzeit nur als Demo mit erfundenen Inhalten vorgesehen, nicht für echte Praxisgespräche. Echte Praxisdaten dürfen niemals an externe KI-Dienste gelangen.",
    features: [
      "Natürlicher Gesprächswechsel in der Live-Demo",
      "Unterbrechen im Gespräch in der Live-Demo",
    ],
    audioSrc: "/sounds/voices/silvia-live-marin.wav",
  },
] as const;
