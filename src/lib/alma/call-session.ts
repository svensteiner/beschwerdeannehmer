/**
 * Guardrails for asynchronous call work. A response or recording may only
 * change the interface while it still belongs to the currently live call.
 */
export function isCurrentCallSession(input: {
  callGeneration: number;
  currentCallGeneration: number;
  phase: string;
}): boolean {
  return (
    input.callGeneration === input.currentCallGeneration &&
    input.phase === "live"
  );
}

export function isCurrentRecordingSession(input: {
  listenGeneration: number;
  currentListenGeneration: number;
  callGeneration: number;
  currentCallGeneration: number;
  phase: string;
  ownsRecorder?: boolean;
}): boolean {
  return (
    isCurrentCallSession({
      callGeneration: input.callGeneration,
      currentCallGeneration: input.currentCallGeneration,
      phase: input.phase,
    }) &&
    input.listenGeneration === input.currentListenGeneration &&
    input.ownsRecorder !== false
  );
}

/** Stops every track immediately; safe to call again from delayed recorder cleanup. */
export function stopMediaStreamTracks(
  stream: Pick<MediaStream, "getTracks"> | null | undefined,
) {
  stream?.getTracks().forEach((track) => track.stop());
}
