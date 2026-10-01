/** Live-Tafel / Leitung: MediaRecorder until silence, not a 6 s hard stop. */

export const LISTEN_MAX_MS = 20_000;
export const LISTEN_SILENCE_MS = 1_200;
export const LISTEN_MIN_MS = 400;
export const LISTEN_QUIET_BYTES = 400;
/**
 * Unter diesem RMS gilt "still". 0,012 war fuer leise Laptop-Mikrofone zu hoch (Sprache
 * ~0,01 -> Abbruch nach 1,2 s). Mit MIC_GAIN 4 im Recorder liegt Sprache jetzt bei ~0,04,
 * Raumrauschen bei ~0,004 — 0,008 trennt beides sauber.
 */
export const LISTEN_RMS_SILENT = 0.008;

/** Louder than room tone / speaker leak, after echoCancellation. */
export const BARGE_RMS = 0.045;
export const BARGE_IGNORE_MS = 450;
export const BARGE_HOLD_MS = 180;

export function isSilentRms(rms: number, threshold = LISTEN_RMS_SILENT): boolean {
  return Number(rms) < threshold;
}

/** Interrupt Silvia only after playback has settled and the caller stays loud. */
export function shouldBargeIn(input: {
  elapsedMs: number;
  loudForMs: number;
  ignoreMs?: number;
  holdMs?: number;
}): boolean {
  const ignoreMs = input.ignoreMs ?? BARGE_IGNORE_MS;
  const holdMs = input.holdMs ?? BARGE_HOLD_MS;
  return Number(input.elapsedMs) >= ignoreMs && Number(input.loudForMs) >= holdMs;
}

export function shouldStopListen(input: {
  elapsedMs: number;
  silentForMs: number;
  maxMs?: number;
  silenceMs?: number;
  minMs?: number;
}): boolean {
  const elapsed = Number(input.elapsedMs);
  const silentFor = Number(input.silentForMs);
  const maxMs = input.maxMs ?? LISTEN_MAX_MS;
  const silenceMs = input.silenceMs ?? LISTEN_SILENCE_MS;
  const minMs = input.minMs ?? LISTEN_MIN_MS;
  if (elapsed >= maxMs) return true;
  return elapsed >= minMs && silentFor >= silenceMs;
}
