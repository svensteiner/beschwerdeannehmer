import type { MutableRefObject } from "react";
import { clearAudioPreview, startAudioPreview } from "@/lib/alma/audio-preview";

/**
 * Typen der Gespraechsoberflaeche.
 *
 * Aus `sprechen-call.tsx` ausgelagert (Punkt 9 der Code-Durchsicht): reine
 * Deklarationen ohne Zustandsbindung. Die Komponente wird dadurch kuerzer,
 * und die Typen sind an einer Stelle auffindbar.
 */
export type Line = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  sourceLabel?: string;
  sourceFallback?: boolean;
};

export type Phase = "idle" | "ringing" | "live" | "ended";

export type LastTrainingFact = {
  source: string;
  fact: string;
  id?: string;
  lineId?: string;
  speechOnly?: boolean;
};

/**
 * Mikrofon-Aufnahme: Echo- und Rauschunterdrueckung sowie automatische
 * Verstaerkung. Die Software-Verstaerkung vor dem Recorder hebt leise Signale
 * ueber die Stille-Schwelle; der Begrenzer reduziert Clipping, garantiert aber
 * keine unverzerrte Aufnahme.
 */
export const MIC_AUDIO = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
} as const;

export const MIC_GAIN = 4;

export const MIC_LIMITER = {
  threshold: -6,
  knee: 0,
  ratio: 20,
  attack: 0.003,
  release: 0.25,
} as const;

export function stopAudio(ref: MutableRefObject<HTMLAudioElement | null>) {
  const audio = ref.current;
  ref.current = null;
  if (!audio) return;
  audio.onended = null;
  audio.onerror = null;
  audio.onpause = null;
  clearAudioPreview(audio);
  audio.pause();
}

export function playFile(
  ref: MutableRefObject<HTMLAudioElement | null>,
  src: string,
  volume = 1,
) {
  stopAudio(ref);
  const audio = new Audio(src);
  audio.volume = volume;
  ref.current = audio;
  startAudioPreview(audio);
  void audio.play().catch(() => undefined);
  return audio;
}

type PlaybackTimers = {
  setInterval: (callback: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
};

export type PlaybackOutcome = "ended" | "error" | "cancel";

export function waitForAudioPlayback(
  audio: HTMLAudioElement,
  shouldCancel: () => boolean,
  timers: PlaybackTimers = {
    setInterval: (callback, ms) => window.setInterval(callback, ms),
    clearInterval: (id) => window.clearInterval(id),
  },
): {
  ended: Promise<PlaybackOutcome>;
  finish: (outcome?: PlaybackOutcome) => void;
} {
  let done = false;
  let id = 0;
  let resolveEnded!: (outcome: PlaybackOutcome) => void;
  const finish = (outcome: PlaybackOutcome = "cancel") => {
    if (done) return;
    done = true;
    timers.clearInterval(id);
    audio.onended = null;
    audio.onerror = null;
    audio.onpause = null;
    resolveEnded(outcome);
  };
  const ended = new Promise<PlaybackOutcome>((resolve) => {
    resolveEnded = resolve;
    audio.onended = () => finish("ended");
    audio.onerror = () => finish("error");
    audio.onpause = () => finish(audio.ended ? "ended" : "cancel");
    id = timers.setInterval(() => {
      if (shouldCancel()) finish();
    }, 40);
  });
  return { ended, finish };
}

export async function playAudioWithPlayback(
  audio: HTMLAudioElement,
  playback: {
    ended: Promise<PlaybackOutcome>;
    finish: (outcome?: PlaybackOutcome) => void;
  },
): Promise<PlaybackOutcome> {
  void startAudioPlayback(audio, playback);
  return playback.ended;
}

/** Startet die Wiedergabe getrennt vom Warten auf ihr Ende.
 *
 * Der Folgechunk darf erst nach dem bestätigten Start der aktuellen Ausgabe
 * vorgeladen werden. So kann ein hängender Folge-Transport den ersten Satz
 * nicht vor seiner Hörbarkeit überholen.
 */
export async function startAudioPlayback(
  audio: HTMLAudioElement,
  playback: {
    ended: Promise<PlaybackOutcome>;
    finish: (outcome?: PlaybackOutcome) => void;
  },
): Promise<boolean> {
  try {
    await Promise.resolve(audio.play());
    return true;
  } catch {
    playback.finish("error");
    return false;
  }
}

export function nextTrainingPlaceholder(
  listening: boolean,
  micOk = true,
): string {
  if (listening) return "Sprechen Sie – Pause heißt fertig";
  return micOk
    ? "Sagen Sie es Silvia – oder tippen Sie"
    : "Mikrofon gesperrt – Begriff hier tippen";
}

/** Ehrliche Statuszeile für Demo, Testanruf, öffentliche Leitung und Praxis. */
export function conversationStatusText({
  training,
  testMode,
  forceDemo,
  live,
  inbound,
}: {
  training: boolean;
  testMode: boolean;
  forceDemo: boolean;
  live: boolean;
  inbound: boolean;
}): string {
  if (training) return "Schulung · Wissen, Begrüßung und Ton";
  if (testMode) return "Testanruf";
  if (forceDemo || (!live && !inbound)) return "Demo mit erfundenen Daten";
  if (inbound) return "Anruf über Ihre Leitung";
  return "Gesprächsprotokoll für die Praxis";
}
