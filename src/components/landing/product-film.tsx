import type { JSX, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import * as Film from "@/components/landing/product-film-scenes";
import { clearAudioPreview, startAudioPreview } from "@/lib/alma/audio-preview";

/** Coarse clock fallback where requestAnimationFrame is throttled. */
const FALLBACK_TICK_MS = 250;
const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const revealText = (text: string, progress: number) =>
  text.slice(0, Math.round(text.length * clamp01(progress)));
const formatTime = (totalSeconds: number) => {
  const seconds = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/** Tracks `prefers-reduced-motion` so scenes can drop continuous animation. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Deterministic, rAF-driven timeline clock for the 32s film (no setTimeout chains). */
function useFilmClock(
  onTick: (elapsed: number) => void,
  onSeek: (elapsed: number) => void,
) {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const rafRef = useRef<number | null>(null);
  const originRef = useRef(0);
  const elapsedRef = useRef(0);
  const onTickRef = useRef(onTick);
  const onSeekRef = useRef(onSeek);
  onTickRef.current = onTick;
  onSeekRef.current = onSeek;

  // rAF for smooth frames, plus a coarse interval so the clock still advances
  // where rAF is throttled (hidden panes, embedded previews).
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const tick = useCallback(
    (now: number) => {
      const next = Math.min(
        (now - originRef.current) / 1000,
        Film.FILM_DURATION_S,
      );
      if (next === elapsedRef.current) return;
      elapsedRef.current = next;
      setElapsed(next);
      onTickRef.current(next);
      if (next >= Film.FILM_DURATION_S) {
        setPlaying(false);
        setEnded(true);
        stopLoop();
      }
    },
    [stopLoop],
  );

  const frame = useCallback(
    (now: number) => {
      tick(now);
      if (rafRef.current !== null)
        rafRef.current = requestAnimationFrame(frame);
    },
    [tick],
  );

  const play = useCallback(() => {
    if (elapsedRef.current >= Film.FILM_DURATION_S) {
      elapsedRef.current = 0;
      setElapsed(0);
      setEnded(false);
    }
    originRef.current = performance.now() - elapsedRef.current * 1000;
    setPlaying(true);
    stopLoop();
    rafRef.current = requestAnimationFrame(frame);
    intervalRef.current = setInterval(
      () => tick(performance.now()),
      FALLBACK_TICK_MS,
    );
  }, [stopLoop, frame, tick]);

  const pause = useCallback(() => {
    setPlaying(false);
    stopLoop();
  }, [stopLoop]);

  const seek = useCallback((seconds: number) => {
    const clamped =
      clamp01(seconds / Film.FILM_DURATION_S) * Film.FILM_DURATION_S;
    elapsedRef.current = clamped;
    setElapsed(clamped);
    setEnded(clamped >= Film.FILM_DURATION_S);
    originRef.current = performance.now() - clamped * 1000;
    onSeekRef.current(clamped);
  }, []);

  const restart = useCallback(() => {
    seek(0);
    play();
  }, [seek, play]);

  useEffect(() => stopLoop, [stopLoop]);
  return { elapsed, playing, ended, play, pause, seek, restart };
}

/** Owns one reusable HTMLAudioElement per cue; play() is try/catch-guarded for autoplay policies. */
function useAudioCuePool(muted: boolean, onAudioBlocked: () => void) {
  const poolRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const pausedCueIdsRef = useRef<Set<string>>(new Set());
  const seekGenerationRef = useRef(0);
  const mutedRef = useRef(muted);
  const pendingSeekRef = useRef(
    new Map<string, { generation: number; offset: number; resume: boolean }>(),
  );
  mutedRef.current = muted;

  const pauseAll = useCallback((reset = true) => {
    if (reset) {
      seekGenerationRef.current += 1;
      pendingSeekRef.current.clear();
    } else {
      for (const pending of pendingSeekRef.current.values()) {
        pending.resume = false;
      }
    }
    for (const [id, audio] of poolRef.current) {
      if (!reset && !audio.paused) pausedCueIdsRef.current.add(id);
      audio.pause();
      if (reset) audio.currentTime = 0;
    }
    if (reset) pausedCueIdsRef.current.clear();
  }, []);

  const getAudio = useCallback(
    (cue: Film.AudioCue): HTMLAudioElement | null => {
      if (typeof Audio === "undefined") return null;
      const pool = poolRef.current;
      let audio = pool.get(cue.id);
      if (!audio) {
        audio = new Audio(cue.src);
        audio.preload = "auto";
        pool.set(cue.id, audio);
      }
      return audio;
    },
    [],
  );

  const resumeActive = useCallback(() => {
    for (const id of pausedCueIdsRef.current) {
      const audio = poolRef.current.get(id);
      if (!audio) continue;
      const pending = pendingSeekRef.current.get(id);
      if (pending) {
        pending.resume = true;
        continue;
      }
      if (
        audio.ended ||
        (Number.isFinite(audio.duration) && audio.currentTime >= audio.duration)
      ) {
        continue;
      }
      try {
        startAudioPreview(audio);
        void audio.play()?.catch(onAudioBlocked);
      } catch {
        onAudioBlocked();
      }
    }
    pausedCueIdsRef.current.clear();
  }, [onAudioBlocked]);

  const playCue = useCallback(
    (cue: Film.AudioCue) => {
      const audio = getAudio(cue);
      if (!audio) return;
      try {
        audio.currentTime = 0;
        audio.volume = cue.volume;
        audio.muted = muted;
        startAudioPreview(audio);
        void audio.play()?.catch(onAudioBlocked);
      } catch {
        onAudioBlocked();
      }
    },
    [getAudio, muted, onAudioBlocked],
  );

  const seekActive = useCallback(
    (cues: readonly Film.AudioCue[], elapsed: number, resume: boolean) => {
      const generation = ++seekGenerationRef.current;
      for (const cue of cues) {
        if (cue.at > elapsed) {
          const audio = poolRef.current.get(cue.id);
          if (!audio) continue;
          audio.pause();
          audio.currentTime = 0;
          pausedCueIdsRef.current.delete(cue.id);
          continue;
        }
        const audio = getAudio(cue);
        if (!audio) continue;
        const offset = Math.max(0, elapsed - cue.at);
        const pending = { generation, offset, resume };
        pendingSeekRef.current.set(cue.id, pending);
        const position = () => {
          const current = pendingSeekRef.current.get(cue.id);
          if (seekGenerationRef.current !== generation || current !== pending) return;
          if (Number.isFinite(audio.duration) && offset >= audio.duration) {
            audio.pause();
            audio.currentTime = 0;
            pausedCueIdsRef.current.delete(cue.id);
            pendingSeekRef.current.delete(cue.id);
            return;
          }
          if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
            audio.addEventListener("canplay", position, { once: true });
            return;
          }
          audio.pause();
          audio.volume = cue.volume;
          audio.muted = mutedRef.current;
          const settle = () => {
            const latest = pendingSeekRef.current.get(cue.id);
            if (seekGenerationRef.current !== generation || latest !== pending) return;
            pendingSeekRef.current.delete(cue.id);
            if (!latest.resume) {
              pausedCueIdsRef.current.add(cue.id);
              return;
            }
            pausedCueIdsRef.current.delete(cue.id);
            try {
              startAudioPreview(audio);
              void audio.play()?.catch(onAudioBlocked);
            } catch {
              onAudioBlocked();
            }
          };
          audio.addEventListener("seeked", settle, { once: true });
          audio.currentTime = offset;
          if (!audio.seeking && Math.abs(audio.currentTime - offset) < 0.01) {
            settle();
          }
        };
        if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
          audio.pause();
          audio.currentTime = offset;
          audio.volume = cue.volume;
          audio.muted = mutedRef.current;
          pausedCueIdsRef.current.add(cue.id);
          audio.addEventListener("loadedmetadata", position, { once: true });
        } else {
          position();
        }
      }
    },
    [getAudio, onAudioBlocked],
  );

  useEffect(() => {
    for (const audio of poolRef.current.values()) audio.muted = muted;
  }, [muted]);

  useEffect(() => {
    const pool = poolRef.current;
    const pendingSeek = pendingSeekRef.current;
    return () => {
      seekGenerationRef.current += 1;
      pendingSeek.clear();
      for (const audio of pool.values()) {
        clearAudioPreview(audio);
        audio.pause();
        audio.src = "";
      }
      pool.clear();
    };
  }, []);

  return { playCue, pauseAll, resumeActive, seekActive };
}

type BubbleTone = "silvia" | "caller";

function ChatBubble({
  label,
  text,
  align = "start",
  tone = "silvia",
}: {
  label: string;
  text: string;
  align?: "start" | "end";
  tone?: BubbleTone;
}) {
  return (
    <div
      className={cn(
        "max-w-[86cqw] rounded-[3cqw] px-[3.4cqw] py-[2.4cqw]",
        align === "end" && "ml-auto",
        tone === "silvia" ? "bg-night-foreground text-night" : "bg-white/12",
      )}
    >
      <p className="mb-[0.6cqw] text-[clamp(0.6rem,2cqw,0.75rem)] font-semibold tracking-[0.08em] uppercase opacity-70">
        {label}
      </p>
      <p className="text-[clamp(0.8rem,2.6cqw,1.05rem)] leading-snug">{text}</p>
    </div>
  );
}

/** Shared full-height, centered flex column used by most chat-style scenes. */
function Panel({
  gap,
  className,
  children,
}: {
  gap: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col justify-center px-[6cqw]",
        gap,
        className,
      )}
    >
      {children}
    </div>
  );
}

function CalendarRowItem({
  row,
  visible,
}: {
  row: Film.CalendarRow;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <div className="alma-rise flex items-center justify-between gap-[2cqw] rounded-[2cqw] border border-border bg-white px-[3cqw] py-[2.2cqw]">
      <p className="text-[clamp(0.68rem,2.1cqw,0.92rem)] leading-snug">
        <span className="font-display tabular-nums">{row.time}</span> ·{" "}
        {row.pet} · {row.owner} · {row.note}
      </p>
      <span
        className={cn(
          "shrink-0 rounded-[3px] px-[2cqw] py-[0.8cqw] text-[clamp(0.58rem,1.7cqw,0.72rem)] font-semibold",
          row.tone === "ok" && "bg-[#E7F0EA] text-ok",
          row.tone === "warn" && "bg-[#F6ECDF] text-warn",
          row.tone === "flag" && "bg-[#F7E7E5] text-flag",
        )}
      >
        {row.status}
      </span>
    </div>
  );
}

function StampItem({ label, visible }: { label: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="alma-rise rounded-[2.4cqw] border border-night-foreground/25 px-[3cqw] py-[2.6cqw] text-center">
      <p className="text-[clamp(0.76rem,2.3cqw,1rem)] font-semibold">{label}</p>
    </div>
  );
}

type SceneProps = { sceneT: number; reducedMotion: boolean };

/** One renderer per SceneId, keyed by id; every entry shares the same call signature. */
const SCENE_RENDERERS: Record<
  Film.SceneId,
  (props: SceneProps) => JSX.Element
> = {
  ringing: ({ reducedMotion }) => (
    <Panel gap="gap-[2.4cqw]" className="items-center text-center">
      <span
        className={cn(
          "size-2.5 rounded-full bg-flag",
          !reducedMotion && "alma-pulse",
        )}
      />
      <p className="font-display text-[clamp(1.2rem,5.4cqw,2.1rem)] font-semibold">
        {Film.RINGING_COPY.dateline}
      </p>
      <p className="text-[clamp(0.85rem,2.6cqw,1.1rem)] text-[#B9C7C0]">
        {Film.RINGING_COPY.subtitle}
      </p>
    </Panel>
  ),
  pickup: ({ reducedMotion }) => (
    <Panel gap="gap-[3cqw]">
      <div className="flex h-[11cqw] min-h-8 items-end gap-[0.8cqw]">
        {Film.WAVE_BAR_DELAYS.map((delay, i) => (
          <span
            key={delay}
            className={cn(
              "h-full flex-1 rounded-full",
              !reducedMotion && "alma-wave",
            )}
            style={{
              animationDelay: reducedMotion ? undefined : `${delay}s`,
              transform: reducedMotion ? "scaleY(0.55)" : undefined,
              background:
                i % 3 === 1 ? "#8FD3AE" : i % 2 === 0 ? "#5E9C7A" : "#F3EFE6",
            }}
          />
        ))}
      </div>
      <ChatBubble label="SILVIA" text={Film.PICKUP_LINE} />
    </Panel>
  ),
  "caller-symptom": ({ sceneT }) => (
    <Panel gap="gap-0">
      <ChatBubble
        label="ANRUF"
        text={revealText(
          Film.CALLER_SYMPTOM_LINE,
          sceneT / Film.CALLER_TYPE_DURATION_S,
        )}
        align="end"
        tone="caller"
      />
    </Panel>
  ),
  "patient-card": ({ sceneT }) => {
    const slide = clamp01(sceneT / Film.PATIENT_CARD_SLIDE_S);
    return (
      <Panel gap="gap-[3cqw]">
        <div
          className="ml-auto w-[78cqw] max-w-[420px] rounded-[3cqw] bg-night-foreground/95 p-[3.6cqw] text-night"
          style={{
            transform: `translateX(${(1 - slide) * 26}cqw)`,
            opacity: slide,
          }}
        >
          <p className="font-display text-[clamp(1rem,3.4cqw,1.4rem)] font-semibold">
            {Film.PATIENT_CARD.title}
          </p>
          <p className="mt-[0.6cqw] text-[clamp(0.72rem,2.2cqw,0.9rem)] text-[#5B655F]">
            {Film.PATIENT_CARD.meta}
          </p>
          <p className="mt-[0.3cqw] text-[clamp(0.72rem,2.2cqw,0.9rem)] text-[#5B655F]">
            {Film.PATIENT_CARD.note}
          </p>
        </div>
        <ChatBubble label="SILVIA" text={Film.PATIENT_CARD_LINE} />
      </Panel>
    );
  },
  "booking-confirm": ({ sceneT }) => (
    <Panel gap="gap-[2.2cqw]">
      <ChatBubble
        label="ANRUF"
        text={Film.BOOKING_CALLER_LINE}
        align="end"
        tone="caller"
      />
      <ChatBubble label="SILVIA" text={Film.BOOKING_SILVIA_LINE} />
      {sceneT >= Film.SMS_APPEAR_AT_S ? (
        <div className="alma-rise max-w-[86cqw] rounded-[3cqw] border border-ok/40 bg-ok/15 px-[3.4cqw] py-[2.4cqw]">
          <p className="mb-[0.6cqw] text-[clamp(0.6rem,2cqw,0.75rem)] font-semibold tracking-[0.08em] text-ok uppercase">
            SMS
          </p>
          <p className="text-[clamp(0.78rem,2.4cqw,0.95rem)] leading-snug">
            {Film.BOOKING_SMS_LINE}
          </p>
        </div>
      ) : null}
    </Panel>
  ),
  calendar: ({ sceneT }) => (
    <div className="flex h-full flex-col bg-card px-[5cqw] py-[4cqw] text-foreground">
      <p className="mb-[3cqw] font-display text-[clamp(0.82rem,3cqw,1.15rem)] font-semibold">
        {Film.CALENDAR_HEADER}
      </p>
      <div className="flex flex-1 flex-col justify-center gap-[2cqw]">
        {Film.CALENDAR_ROWS.map((row, i) => (
          <CalendarRowItem
            key={row.time}
            row={row}
            visible={sceneT >= Film.CALENDAR_ROW_STAGGER_S * (i + 1)}
          />
        ))}
      </div>
    </div>
  ),
  stamps: ({ sceneT }) => (
    <Panel gap="gap-[3cqw]">
      <p className="text-[clamp(0.65rem,2cqw,0.8rem)] font-semibold tracking-[0.14em] text-[#8FA79A] uppercase">
        {Film.STAMPS_KICKER}
      </p>
      <div className="grid grid-cols-2 gap-[2.4cqw]">
        {Film.STAMPS.map((stamp, i) => (
          <StampItem
            key={stamp}
            label={stamp}
            visible={sceneT >= Film.STAMP_STAGGER_S * i}
          />
        ))}
      </div>
    </Panel>
  ),
  end: () => (
    <Panel gap="gap-[1.8cqw]" className="items-center text-center">
      <p className="flex items-center gap-[1.4cqw] font-display text-[clamp(1.5rem,6.4cqw,2.6rem)] font-semibold">
        Silvia.
        <span className="size-3 rounded-full bg-ok" aria-hidden />
      </p>
      <p className="max-w-[70cqw] text-[clamp(0.8rem,2.4cqw,1.05rem)] text-[#B9C7C0]">
        {Film.END_TAGLINE}
      </p>
      <p className="text-[clamp(0.7rem,2cqw,0.88rem)] text-[#8FA79A]">
        {Film.END_TRIAL_NOTE}
      </p>
    </Panel>
  ),
};

function ProductFilmPoster({ onPlay }: { onPlay: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-[4cqw] bg-night px-[6cqw] text-center">
      <p className="font-display text-[clamp(1.1rem,4.6cqw,1.9rem)] font-semibold text-night-foreground">
        So hebt Silvia ab.
      </p>
      <button
        type="button"
        onClick={onPlay}
        className="flex min-h-14 items-center gap-3 rounded-full bg-night-foreground px-6 text-night shadow-soft transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ok focus-visible:outline-none"
        aria-label="Produktfilm abspielen, 32 Sekunden mit Ton"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-night text-night-foreground">
          <Play className="ms-0.5 size-4 fill-current" aria-hidden />
        </span>
        <span className="text-[15px] font-semibold">Film starten · 0:32</span>
      </button>
    </div>
  );
}

function ReplayOverlay({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-night/70 to-transparent pb-[14cqw]">
      <button
        type="button"
        onClick={onRestart}
        className="flex min-h-11 items-center gap-2 rounded-full bg-night-foreground px-5 text-[14px] font-semibold text-night shadow-soft transition-transform hover:scale-105"
      >
        <RotateCcw className="size-4" aria-hidden />
        Nochmal ansehen
      </button>
    </div>
  );
}

function ControlsBar({
  playing,
  elapsed,
  muted,
  ended,
  onTogglePlay,
  onSeek,
  onToggleMute,
  onRestart,
}: {
  playing: boolean;
  elapsed: number;
  muted: boolean;
  ended: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onToggleMute: () => void;
  onRestart: () => void;
}) {
  const handleProgressClick = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onSeek(
      clamp01((event.clientX - rect.left) / rect.width) * Film.FILM_DURATION_S,
    );
  };

  const handleProgressKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") onSeek(elapsed + 1);
    else if (event.key === "ArrowLeft") onSeek(elapsed - 1);
    else if (event.key === "Home") onSeek(0);
    else if (event.key === "End") onSeek(Film.FILM_DURATION_S);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 flex items-center gap-[2.4cqw] bg-gradient-to-t from-night/90 to-transparent px-[4cqw] py-[3cqw] opacity-0 transition-opacity",
        "group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100",
        (!playing || ended) && "opacity-100",
      )}
    >
      <button
        type="button"
        onClick={onTogglePlay}
        onKeyDown={(event) => event.stopPropagation()}
        aria-label={playing ? "Pause" : "Abspielen"}
        className="shrink-0 text-night-foreground"
      >
        {playing ? (
          <Pause className="size-5 fill-current" aria-hidden />
        ) : (
          <Play className="size-5 fill-current" aria-hidden />
        )}
      </button>
      <div
        role="slider"
        aria-label="Filmfortschritt"
        aria-valuemin={0}
        aria-valuemax={Film.FILM_DURATION_S}
        aria-valuenow={Math.round(elapsed)}
        tabIndex={0}
        onClick={handleProgressClick}
        onKeyDown={handleProgressKeyDown}
        className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-night-foreground/25"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-night-foreground"
          style={{ width: `${(elapsed / Film.FILM_DURATION_S) * 100}%` }}
        />
      </div>
      <span className="shrink-0 font-display text-[12px] tabular-nums text-night-foreground/85">
        {formatTime(elapsed)} / {formatTime(Film.FILM_DURATION_S)}
      </span>
      <button
        type="button"
        onClick={onToggleMute}
        onKeyDown={(event) => event.stopPropagation()}
        aria-label={muted ? "Ton einschalten" : "Ton ausschalten"}
        className="shrink-0 text-night-foreground"
      >
        {muted ? (
          <VolumeX className="size-5" aria-hidden />
        ) : (
          <Volume2 className="size-5" aria-hidden />
        )}
      </button>
      {ended ? (
        <button
          type="button"
          onClick={onRestart}
          onKeyDown={(event) => event.stopPropagation()}
          className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-night-foreground"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Nochmal
        </button>
      ) : null}
    </div>
  );
}

/**
 * Code-rendered, 32-second product film. A deterministic rAF timeline drives
 * eight DOM scenes (no <video>/mp4/webm) so quality never depends on an
 * encoded asset. Audio cues (ring, greeting) play through a small reusable
 * HTMLAudioElement pool and respect the mute toggle and reduced-motion.
 */
export function ProductFilm({ className }: { className?: string }) {
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const playedCuesRef = useRef<Set<string>>(new Set());
  const onAudioBlocked = useCallback(() => setAudioBlocked(true), []);
  const { playCue, pauseAll, resumeActive, seekActive } = useAudioCuePool(muted, onAudioBlocked);

  const syncPlayedCues = useCallback(
    (elapsed: number, fire: boolean) => {
      for (const cue of Film.AUDIO_CUES) {
        const shouldHavePlayed = cue.at <= elapsed;
        const alreadyMarked = playedCuesRef.current.has(cue.id);
        if (shouldHavePlayed && !alreadyMarked) {
          playedCuesRef.current.add(cue.id);
          if (fire) playCue(cue);
        } else if (!shouldHavePlayed && alreadyMarked) {
          playedCuesRef.current.delete(cue.id);
        }
      }
    },
    [playCue],
  );

  const handleTick = useCallback(
    (elapsed: number) => syncPlayedCues(elapsed, true),
    [syncPlayedCues],
  );
  const handleSeek = useCallback(
    (elapsed: number) => syncPlayedCues(elapsed, false),
    [syncPlayedCues],
  );
  const {
    elapsed,
    playing,
    ended,
    play,
    pause: clockPause,
    seek: clockSeek,
    restart: clockRestart,
  } = useFilmClock(handleTick, handleSeek);

  // Stop any in-flight audio cue before the clock pauses or seeks, so cues never keep
  // playing past the moment the film stopped advancing.
  const pause = useCallback(() => {
    pauseAll(false);
    clockPause();
  }, [pauseAll, clockPause]);

  const resume = useCallback(() => {
    resumeActive();
    play();
  }, [resumeActive, play]);

  const seek = useCallback(
    (seconds: number) => {
      pauseAll();
      seekActive(Film.AUDIO_CUES, seconds, playing);
      clockSeek(seconds);
    },
    [pauseAll, seekActive, clockSeek, playing],
  );

  const restart = useCallback(() => {
    pauseAll();
    setAudioBlocked(false);
    clockRestart();
  }, [pauseAll, clockRestart]);

  useEffect(() => {
    if (ended) pauseAll();
  }, [ended, pauseAll]);

  const handleStart = useCallback(() => {
    setAudioBlocked(false);
    setStarted(true);
    play();
  }, [play]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!started) return;
    if (event.target !== event.currentTarget) return;
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      if (playing) pause();
      else resume();
    } else if (event.key === "Home") {
      event.preventDefault();
      restart();
    }
  };

  const activeScene = Film.getActiveScene(elapsed);
  const SceneRenderer = SCENE_RENDERERS[activeScene.id];

  return (
    <div
      className={cn(
        "group relative isolate overflow-hidden rounded-xl bg-night text-night-foreground shadow-soft [container-type:inline-size]",
        className,
      )}
      role="region"
      aria-label="Produktfilm: Silvia hebt ab"
      aria-live="off"
      tabIndex={started ? 0 : -1}
      onKeyDown={handleKeyDown}
    >
      <div className="relative aspect-[16/9] w-full">
        {started ? (
          <SceneRenderer
            sceneT={elapsed - activeScene.from}
            reducedMotion={reducedMotion}
          />
        ) : (
          <ProductFilmPoster onPlay={handleStart} />
        )}
        {started && ended ? <ReplayOverlay onRestart={restart} /> : null}
        {started ? (
          <ControlsBar
            playing={playing}
            elapsed={elapsed}
            muted={muted}
            ended={ended}
            onTogglePlay={() => (playing ? pause() : resume())}
            onSeek={seek}
            onToggleMute={() => setMuted((value) => !value)}
            onRestart={restart}
          />
        ) : null}
      </div>
      {audioBlocked && !muted ? (
        <p
          role="status"
          className="px-4 py-2 text-center text-xs text-night-foreground/80"
        >
          Ton wurde vom Browser blockiert – der Film läuft ohne Ton.
        </p>
      ) : null}
    </div>
  );
}
