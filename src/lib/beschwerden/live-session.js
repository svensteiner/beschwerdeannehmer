/**
 * Die fachliche Konfiguration für ein echtes OpenAI-Live-Gespräch.
 * Sie enthält keine Zugangsdaten und kann einfach getestet oder angepasst werden.
 */
export function openAiLiveSession() {
  return {
    expires_after: { anchor: "created_at", seconds: 60 },
    session: {
      type: "realtime",
      model: "gpt-realtime-2.1",
      output_modalities: ["audio"],
      instructions: [
        "Du bist ein freundlicher deutschsprachiger Kundenservice für Parkgaragen.",
        "Führe ein natürliches, kurzes Gespräch und frage immer nur die sinnvollste nächste Information.",
        "Ermittle Standort, Kategorie, Zeitpunkt und Dringlichkeit einer Beschwerde.",
        "Frage niemals nach Zahlungsdaten oder Passwörtern und mache keine rechtlichen Zusagen.",
      ].join(" "),
      audio: {
        input: { turn_detection: { type: "semantic_vad", eagerness: "low", create_response: true, interrupt_response: true } },
        output: { voice: "marin" },
      },
    },
  };
}
