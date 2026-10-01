/**
 * Live-Wrapper, Stufe 5: Sideband-Brücke.
 *
 * Belegt durch eine echte Sondierung (30.09.2026, synthetische Sätze): Der Server
 * bekommt auf der Sideband-Verbindung `session.input_transcript.delta` (Textstücke
 * der Anrufenden) und kann mit `session.commentary.append` etwas sprechen lassen;
 * die Quittung ist `session.commentary.appended`. Es gibt KEIN "Äußerung fertig"-
 * Ereignis, das Ende einer Äußerung wird deshalb über eine Sprechpause erkannt.
 *
 * Die Brücke kennt weder Modell noch Datenbank: sie sammelt, fragt `decide` und
 * spricht die Antwort. Bei Übergabe (Notfall, leeres Minutenkonto) beendet sie das
 * Gespräch geordnet, statt es weiter der KI zu überlassen.
 */
export type BridgeSocket = {
  send(data: string): void;
};

export type BridgeDecision = { speak: string; handoff: boolean };

export type BridgeDeps = {
  socket: BridgeSocket;
  decide: (utterance: string) => BridgeDecision;
  /** Pause nach dem letzten Textstück, ab der eine Äußerung als beendet gilt. */
  silenceMs?: number;
  /** Nach einer Übergabe: Gespräch nach so vielen ms schließen (Antwort ausgeben lassen). */
  closeAfterHandoffMs?: number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  newId?: () => string;
  onClose?: () => void;
};

export function createLiveBridge(deps: BridgeDeps) {
  const silenceMs = deps.silenceMs ?? 900;
  const closeAfter = deps.closeAfterHandoffMs ?? 6000;
  const st = deps.setTimeout ?? setTimeout;
  const ct = deps.clearTimeout ?? clearTimeout;
  let counter = 0;
  const newId = deps.newId ?? (() => `silvia-turn-${++counter}`);

  let buffer = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let handedOff = false;
  let sentTurns = 0;

  const flush = () => {
    timer = null;
    const utterance = buffer.replace(/\s+/g, " ").trim();
    buffer = "";
    if (!utterance || handedOff) return;
    const result = deps.decide(utterance);
    sentTurns += 1;
    deps.socket.send(JSON.stringify({
      type: "session.commentary.append",
      event_id: newId(),
      delegation_id: null,
      content: result.speak,
    }));
    if (result.handoff) {
      handedOff = true;
      st(() => {
        deps.socket.send(JSON.stringify({ type: "session.close" }));
        deps.onClose?.();
      }, closeAfter);
    }
  };

  return {
    /** Jede Sideband-Nachricht (bereits geparst) hier einspeisen. */
    onEvent(event: { type?: unknown; delta?: unknown }) {
      if (event.type !== "session.input_transcript.delta" || typeof event.delta !== "string") return;
      if (handedOff) return;
      buffer += event.delta;
      if (timer) ct(timer);
      timer = st(flush, silenceMs);
    },
    get handedOff() { return handedOff; },
    get turns() { return sentTurns; },
    /** Beim Beenden offene Timer räumen. */
    dispose() { if (timer) ct(timer); timer = null; },
  };
}
