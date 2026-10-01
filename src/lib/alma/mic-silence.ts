/**
 * Pure, framework-free detector for "microphone delivers no sound".
 *
 * The demo/server-transcription recording flow feeds this with peak-level
 * samples (an RMS or peak amplitude, 0..1) while recording. If the level
 * stays at/under a small fixed threshold continuously for MIC_SILENCE_MS,
 * the caller should show a visible error and stop the recording instead of
 * failing silently (Anforderung AP 50).
 */

/** Below this peak level, the mic is considered "no sound", not just quiet speech. */
export const MIC_SILENCE_PEAK = 0.004;
/** How long the level must stay under the threshold, continuously, to trigger. */
export const MIC_SILENCE_MS = 3_000;

export function isMicSilentPeak(peak: number, threshold = MIC_SILENCE_PEAK): boolean {
  return Number(peak) <= threshold;
}

export class MicSilenceWatch {
  private readonly thresholdMs: number;
  private readonly peakThreshold: number;
  private silentSinceMs: number | null = null;
  private tripped = false;

  constructor(opts?: { thresholdMs?: number; peakThreshold?: number }) {
    this.thresholdMs = opts?.thresholdMs ?? MIC_SILENCE_MS;
    this.peakThreshold = opts?.peakThreshold ?? MIC_SILENCE_PEAK;
  }

  /**
   * Feed one peak-level sample at time `nowMs`. Returns true the moment the
   * silence threshold is crossed (fires once per silent run — call `reset()`,
   * which happens automatically on any loud sample, before it can fire again).
   */
  sample(peak: number, nowMs: number): boolean {
    if (this.tripped) return false;
    if (isMicSilentPeak(peak, this.peakThreshold)) {
      if (this.silentSinceMs == null) this.silentSinceMs = nowMs;
      if (nowMs - this.silentSinceMs >= this.thresholdMs) {
        this.tripped = true;
        return true;
      }
      return false;
    }
    this.silentSinceMs = null;
    return false;
  }

  reset(): void {
    this.silentSinceMs = null;
    this.tripped = false;
  }
}
