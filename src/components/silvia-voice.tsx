import { Pause, Volume2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  INITIAL_HEAR_STATE,
  hearSilviaReduce,
  type HearSilviaState,
} from "@/components/silvia-voice-state";
import {
  beginAudioPreview,
  clearAudioPreview,
  startAudioPreview,
} from "@/lib/alma/audio-preview";
import { speakAlma } from "@/lib/alma/speak";
import { voiceSampleAt } from "@/lib/alma/speak-text";
import {
  VOICES,
  greetingSrc,
  signatureSrc,
  type VoiceId,
} from "@/lib/alma/voices";
import { useAlmaStore } from "@/lib/alma/store";
import { cn } from "@/lib/utils";

export function HearSilvia({
  label = "Silvia hören",
  className,
  sampleSrc,
}: {
  label?: string;
  className?: string;
  /** Vorbereitete Hörprobe, z. B. die echte Live-Demo-Aufnahme. */
  sampleSrc?: string;
}) {
  const voiceId = useAlmaStore((s) => s.voiceId);
  const errorId = `hear-silvia-error-${useId()}`;
  // Der Zustand liegt in einem Automaten (siehe silvia-voice-state.ts):
  // Der Klick schaltet sofort sichtbar auf "Pause", erst ein echter
  // Audiofehler schaltet zurück. Ein an das play()-Promise gekoppelter
  // Zustandswechsel verzögert den Knopf bei einer vorbereiteten WAV-Datei.
  const [state, setState] = useState<HearSilviaState>(INITIAL_HEAR_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;
  const ref = useRef<HTMLAudioElement | null>(null);
  const sampleIndex = useRef(0);
  const mountedRef = useRef(true);
  /** Laufende Anforderung; dieselbe Zahl nutzt die Audio-Koordination. */
  const requestRef = useRef(0);
  const on = state.on;

  /** Führt eine Aktion aus und hält den Ref für späte Callbacks aktuell. */
  const dispatch = useCallback((action: Parameters<typeof hearSilviaReduce>[1]) => {
    const next = hearSilviaReduce(stateRef.current, action);
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  /**
   * Ein Callback gehört nur zur jüngsten Anforderung. Eine abgelöste Probe
   * (der Nutzer hat inzwischen erneut geklickt) darf den sichtbaren Zustand
   * nicht mehr verändern.
   */
  const isCurrentRequest = useCallback(
    (requestId: number) => mountedRef.current && requestRef.current === requestId,
    [],
  );

  useEffect(
    () => () => {
      mountedRef.current = false;
      requestRef.current += 1;
      ref.current?.pause();
      clearAudioPreview(ref.current);
    },
    [],
  );

  /** Meldet eine bestätigte Wiedergabe. */
  function settlePlaying(requestId: number) {
    if (!isCurrentRequest(requestId)) return;
    dispatch({ type: "playing", requestId });
  }

  /**
   * Die Tonquelle liess sich nicht laden oder abspielen. Das wird sichtbar
   * gemeldet, damit der Nutzer nicht nur einen zurückspringenden Knopf sieht.
   */
  function settleFailed(requestId: number) {
    if (!isCurrentRequest(requestId)) return;
    dispatch({ type: "failed", requestId, reason: "error" });
  }

  /**
   * Die Wiedergabe endete oder wurde pausiert. Auch das fällt auf den
   * Ausgangszustand zurück, aber ohne Fehlermeldung — es ist der Normalfall.
   */
  function settleStopped(audio: HTMLAudioElement, requestId: number) {
    clearAudioPreview(audio);
    if (!isCurrentRequest(requestId)) return;
    dispatch({ type: "failed", requestId, reason: "ended" });
  }

  function attachAudio(audio: HTMLAudioElement, requestId: number) {
    audio.onended = () => settleStopped(audio, requestId);
    audio.onpause = () => settleStopped(audio, requestId);
  }

  function playStaticFallback(requestId: number) {
    if (!isCurrentRequest(requestId)) return;
    const audio = new Audio(signatureSrc(voiceId));
    if (!startAudioPreview(audio, requestId)) return;
    ref.current = audio;
    attachAudio(audio, requestId);
    void audio
      .play()
      .then(() => settlePlaying(requestId))
      .catch(() => {
        if (!isCurrentRequest(requestId)) return;
        const fallback = new Audio(greetingSrc(voiceId));
        if (!startAudioPreview(fallback, requestId)) return;
        ref.current = fallback;
        attachAudio(fallback, requestId);
        void fallback
          .play()
          .then(() => settlePlaying(requestId))
          .catch(() => settleFailed(requestId));
      });
  }

  function playPreparedSample(src: string, requestId: number) {
    if (!isCurrentRequest(requestId)) return;
    const audio = new Audio(src);
    if (!startAudioPreview(audio, requestId)) return;
    ref.current = audio;
    attachAudio(audio, requestId);
    void audio
      .play()
      .then(() => settlePlaying(requestId))
      .catch(() => {
        clearAudioPreview(audio);
        settleFailed(requestId);
      });
  }

  function toggle() {
    if (on) {
      ref.current?.pause();
      clearAudioPreview(ref.current);
      ref.current = null;
      const stopped = stateRef.current.requestId + 1;
      requestRef.current = stopped;
      dispatch({ type: "stop", requestId: stopped });
      return;
    }
    ref.current?.pause();
    clearAudioPreview(ref.current);
    ref.current = null;
    // Der Klick schaltet sofort sichtbar auf "Pause" — unabhängig davon, wann
    // audio.play() auflöst. Genau das war im Browseraudit verzögert.
    const requestId = beginAudioPreview();
    requestRef.current = requestId;
    dispatch({ type: "press", requestId });
    if (sampleSrc) {
      playPreparedSample(sampleSrc, requestId);
      return;
    }
    const text = voiceSampleAt(sampleIndex.current++);
    void speakAlma({ data: { text, voice: voiceId } })
      .then((res) => {
        if (!isCurrentRequest(requestId)) return;
        if (!res.ok || !res.audio) {
          playStaticFallback(requestId);
          return;
        }
        const audio = new Audio(res.audio);
        if (!startAudioPreview(audio, requestId)) return;
        ref.current = audio;
        attachAudio(audio, requestId);
        void audio
          .play()
          .then(() => settlePlaying(requestId))
          .catch(() => playStaticFallback(requestId));
      })
      .catch(() => playStaticFallback(requestId));
  }

  return (
    <span className="block">
      <Button
        size="lg"
        variant="outline"
        className={className}
        type="button"
        title={sampleSrc ? "Vorbereitete GPT-Live-1-Aufnahme" : undefined}
        aria-describedby={state.failed ? errorId : undefined}
        onClick={toggle}
      >
        {on ? <Pause /> : <Volume2 />}
        {on ? "Pause" : label}
      </Button>
      {state.failed ? (
        <span
          id={errorId}
          role="alert"
          className="mt-2 block text-sm text-destructive"
        >
          Die Hörprobe konnte nicht abgespielt werden.{" "}
          <button
            type="button"
            id="desk-home-hear-retry"
            className="font-semibold underline underline-offset-2"
            onClick={toggle}
          >
            Erneut versuchen
          </button>
        </span>
      ) : null}
    </span>
  );
}

export function VoicePicker({
  className,
  previewText,
}: {
  className?: string;
  /** Live Tafel greeting. Empty/omitted keeps the Huber demo MP3. */
  previewText?: string;
}) {
  const selected = useAlmaStore((s) => s.voiceId);
  const setVoice = useAlmaStore((s) => s.setVoice);
  const preview = useRef<HTMLAudioElement | null>(null);
  const gen = useRef(0);
  const sampleIndex = useRef(0);
  const mountedRef = useRef(true);
  const livePreview = Boolean(previewText?.trim());

  useEffect(
    () => () => {
      mountedRef.current = false;
      gen.current += 1;
      preview.current?.pause();
      clearAudioPreview(preview.current);
    },
    [],
  );

  function stopPreview() {
    preview.current?.pause();
    clearAudioPreview(preview.current);
    preview.current = null;
  }

  function playFile(src: string, generation: number) {
    const audio = new Audio(src);
    if (!startAudioPreview(audio, generation)) return;
    preview.current = audio;
    audio.onended = () => clearAudioPreview(audio);
    audio.onpause = () => clearAudioPreview(audio);
    void audio.play().catch(() => undefined);
  }

  function pick(id: VoiceId) {
    setVoice(id);
    stopPreview();
    const generation = beginAudioPreview();
    // Erster Druck: die uebergebene Live-Tafel-Begruessung. Danach rotieren
    // die Vorschauen durch VOICE_SAMPLES (Owner-Feedback: variablere Texte).
    // Offset per Stimmen-Position in VOICES, damit vier Tiles hintereinander
    // vier unterschiedliche Saetze sprechen (Owner-Feedback: Stimmen zu
    // aehnlich — auch die Vorschau-Texte sollen sich klar unterscheiden).
    const voiceOffset = VOICES.findIndex((v) => v.id === id);
    const greeting = previewText?.trim() ?? "";
    const text =
      greeting && sampleIndex.current === 0
        ? greeting
        : voiceSampleAt(sampleIndex.current + Math.max(voiceOffset, 0));
    sampleIndex.current += 1;
    const n = ++gen.current;
    void speakAlma({ data: { text, voice: id } })
      .then((res) => {
        if (!mountedRef.current || n !== gen.current) return;
        if (!res.ok || !res.audio) {
          playFile(greetingSrc(id), generation);
          return;
        }
        const audio = new Audio(res.audio);
        if (!startAudioPreview(audio, generation)) return;
        preview.current = audio;
        audio.onended = () => clearAudioPreview(audio);
        audio.onpause = () => clearAudioPreview(audio);
        void audio.play().catch(() => undefined);
      })
      .catch(() => {
        if (!mountedRef.current || n !== gen.current) return;
        playFile(greetingSrc(id), generation);
      });
  }

  return (
    <div
      className={className}
      data-preview-mode={livePreview ? "live" : "demo"}
      data-preview-text={livePreview ? previewText : ""}
    >
      <p className="mb-3 text-xs font-medium tracking-[0.18em] text-primary uppercase">
        Welche Stimme hat Silvia?
      </p>
      <div className="flex flex-wrap gap-2">
        {VOICES.map((v) => (
          <button
            key={v.id}
            id={`sprechen-voice-${v.id}`}
            type="button"
            onClick={() => pick(v.id)}
            aria-pressed={selected === v.id}
            className={cn(
              "min-h-11 rounded-lg border px-3 py-2 text-left transition-colors",
              selected === v.id
                ? "border-primary bg-secondary"
                : "border-border bg-card hover:bg-secondary/60",
            )}
          >
            <span className="block text-sm font-medium">{v.label}</span>
            <span className="block text-[11px] text-muted-foreground">
              {v.note}
            </span>
          </button>
        ))}
      </div>
      {livePreview ? (
        <p
          id="sprechen-voice-preview"
          className="mt-2 text-xs text-muted-foreground"
        >
          Vorschau: {previewText}
        </p>
      ) : null}
    </div>
  );
}
