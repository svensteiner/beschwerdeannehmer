export type LiveEvent = {
  type?: string;
  delta?: string;
  /** Eindeutig je Ereignis; Live liefert keine fertigen Gesprächszüge. */
  event_id?: string;
  start_ms?: number;
  end_ms?: number;
};

export type TranscriptLine = { key: string; speaker: "Sie" | "Silvia"; text: string };

export function mergeTranscriptDelta(lines: TranscriptLine[], message: LiveEvent): TranscriptLine[] {
  if (!message.delta) return lines;
  const speaker = message.type === "session.input_transcript.delta" ? "Sie" : "Silvia";
  // Laut Live-Vertrag werden Fragmente ausschließlich in Lieferreihenfolge
  // aufgebaut; event_id steht für das einzelne Ereignis, nicht für einen Zug.
  const previous = lines[lines.length - 1];
  if (!previous || previous.speaker !== speaker)
    return [...lines, { key: `${speaker}:${lines.length}`, speaker, text: message.delta }];
  return [...lines.slice(0, -1), { ...previous, text: previous.text + message.delta }];
}

export function playLiveDemoAudio(audio: Pick<HTMLAudioElement, "play">, onBlocked: () => void) {
  return Promise.resolve().then(() => audio.play()).catch(() => {
    onBlocked();
  });
}
