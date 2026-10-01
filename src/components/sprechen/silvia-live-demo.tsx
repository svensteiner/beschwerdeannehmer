import { Mic, Phone, PhoneOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  fetchJsonWithTimeout,
  LIVE_DEMO_REQUEST_TIMEOUT_MS,
} from "@/lib/live-demo-request";
import {
  AUDIO_PREVIEW_START_EVENT,
  beginAudioPreview,
} from "@/lib/alma/audio-preview";
import {
  mergeTranscriptDelta,
  playLiveDemoAudio,
  type LiveEvent,
  type TranscriptLine,
} from "./silvia-live-demo-state";

type Phase =
  "idle" | "starting" | "live" | "stopping" | "ended" | "disabled" | "error";
type AvailabilityState = "checking" | "ready" | "blocked" | "failed";
type Run = {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  mic: MediaStream | null;
  sessionId: string;
  generation: number;
  stopGeneration: number | null;
  audio: HTMLAudioElement | null;
  timer: number | null;
  stopTimer: number | null;
  closeRequested: boolean;
};

const MAX_MS = 120_000;

function unavailableLiveDemoMessage(value: unknown) {
  const availability = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  if (availability.enabled !== true)
    return "Die Live-Hörprobe ist noch nicht freigegeben. Bitte noch keine echte Nutzung.";
  if (availability.sandboxReady !== true)
    return availability.sandbox === "persistent-data"
      ? "Die Live-Hörprobe ist mit persistenten Praxisdaten gesperrt."
      : "Die Live-Hörprobe ist nur in einer ausdrücklich eingerichteten Sandbox verfügbar.";
  if (availability.finalizationUncertain === true)
    return "Die vorige Live-Hörprobe ist noch nicht abschließend bestätigt. Bitte später erneut versuchen.";
  if (availability.active === true)
    return "Eine Live-Hörprobe läuft bereits. Bitte warten Sie, bis sie beendet ist.";
  switch (availability.persistentGuard) {
    case "blocked":
      return "Die vorige Live-Hörprobe ist noch nicht abschließend bestätigt. Bitte später erneut versuchen.";
    case "unconfigured":
      return "Die Live-Hörprobe ist derzeit nicht sicher eingerichtet.";
    case "unavailable":
      return "Der Schutz der Live-Hörprobe ist derzeit nicht verfügbar.";
    case "ready":
      return availability.active === false &&
        availability.finalizationUncertain === false &&
        availability.persistentGuardBlocked === false
        ? null
        : "Der Schutzstatus der Live-Hörprobe ist unklar. Bitte später erneut versuchen.";
    default:
      return "Der Schutzstatus der Live-Hörprobe ist unklar. Bitte später erneut versuchen.";
  }
}

export function SilviaLiveDemo() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [availabilityState, setAvailabilityState] =
    useState<AvailabilityState>("checking");
  const [status, setStatus] = useState("Verfügbarkeit der Live-Hörprobe wird geprüft …");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [syntheticOnlyConfirmed, setSyntheticOnlyConfirmed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const generationRef = useRef(0);
  const activeRunRef = useRef<Run | null>(null);
  const runsRef = useRef(new Set<Run>());
  const startRequestRef = useRef<AbortController | null>(null);
  const availabilityRequestRef = useRef<AbortController | null>(null);
  const availabilityGenerationRef = useRef(0);
  const discardRunRef = useRef<(run: Run, closeRemote?: boolean) => void>(() => undefined);
  const stopRef = useRef<(run?: Run | null) => void>(() => undefined);

  const refreshAvailability = useCallback(async function refreshAvailability() {
    const generation = ++availabilityGenerationRef.current;
    availabilityRequestRef.current?.abort();
    const controller = new AbortController();
    availabilityRequestRef.current = controller;
    setAvailabilityState("checking");
    setStatus("Verfügbarkeit der Live-Hörprobe wird geprüft …");
    try {
      const { result } = await fetchJsonWithTimeout(
        "/api/live-demo/status",
        {},
        { signal: controller.signal, label: "Die Verfügbarkeitsprüfung" },
      );
      if (availabilityGenerationRef.current !== generation) return;
      availabilityRequestRef.current = null;
      const unavailable = unavailableLiveDemoMessage(result);
      if (unavailable) {
        setAvailabilityState("blocked");
        setStatus(unavailable);
        return;
      }
      setAvailabilityState("ready");
      setStatus("Live-Hörprobe ist bereit. Mikrofonzugriff erfolgt erst nach dem Start.");
    } catch {
      if (availabilityGenerationRef.current !== generation) return;
      availabilityRequestRef.current = null;
      setAvailabilityState("failed");
      setStatus("Die Verfügbarkeit der Live-Hörprobe konnte nicht geprüft werden. Bitte erneut versuchen.");
    }
  }, []);

  function clearRun(run: Run) {
    if (run.timer !== null) window.clearTimeout(run.timer);
    if (run.stopTimer !== null) window.clearTimeout(run.stopTimer);
    runsRef.current.delete(run);
    if (activeRunRef.current === run) activeRunRef.current = null;
    const ownedAudio = audioRef.current;
    if (ownedAudio && ownedAudio === run.audio) {
      ownedAudio.pause();
      ownedAudio.srcObject = null;
    }
    // Keep cleanup reliable even if the ref and run became briefly unsynced.
    if (run.audio && run.audio !== ownedAudio) {
      run.audio.pause();
      run.audio.srcObject = null;
    }
    run.audio = null;
    run.timer = null;
    run.stopTimer = null;
    run.mic?.getTracks().forEach((track) => track.stop());
    run.mic = null;
    try {
      run.dc.close();
    } catch {
      /* already closed */
    }
    try {
      run.pc.close();
    } catch {
      /* already closed */
    }
  }

  function closeServer(run: Run) {
    if (!run.sessionId || run.closeRequested) return;
    run.closeRequested = true;
    void fetch("/api/live-demo/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: run.sessionId }),
    }).catch(() => undefined);
  }

  function discardRun(run: Run, closeRemote = false) {
    if (closeRemote) closeServer(run);
    clearRun(run);
  }
  discardRunRef.current = discardRun;

  function discardRunAfterStop(run: Run) {
    const wasOwnStop =
      run.stopGeneration !== null &&
      generationRef.current === run.stopGeneration;
    discardRun(run, true);
    if (wasOwnStop) {
      setPhase("error");
      setStatus(
        "Stoppsignal nicht bestätigt; Sitzung bleibt vorsichtshalber unsicher.",
      );
    }
  }

  useEffect(() => {
    void refreshAvailability();
    const runs = runsRef.current;
    const discard = discardRunRef.current;
    return () => {
      availabilityGenerationRef.current += 1;
      availabilityRequestRef.current?.abort();
      availabilityRequestRef.current = null;
      generationRef.current += 1;
      startRequestRef.current?.abort();
      startRequestRef.current = null;
      for (const run of [...runs]) discard(run, true);
      runs.clear();
      activeRunRef.current = null;
      if (audioRef.current) audioRef.current.srcObject = null;
    };
  }, [refreshAvailability]);

  useEffect(() => {
    const stopForNewAudio = () => {
      const run = activeRunRef.current;
      if (!run) return;
      // Der neue Klick hat Vorrang: Ton und Mikrofon dieser Cloud-Sitzung
      // werden sofort stillgelegt, anschließend wird die Sitzung geschlossen.
      run.audio?.pause();
      if (run.audio) run.audio.srcObject = null;
      void stopRef.current(run);
    };
    window.addEventListener(AUDIO_PREVIEW_START_EVENT, stopForNewAudio);
    return () => window.removeEventListener(AUDIO_PREVIEW_START_EVENT, stopForNewAudio);
  }, []);

  async function waitForIce(pc: RTCPeerConnection) {
    if (pc.iceGatheringState === "complete") return;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        pc.removeEventListener("icegatheringstatechange", done);
        reject(new Error("ICE-Zeitüberschreitung"));
      }, 10_000);
      function done() {
        if (pc.iceGatheringState !== "complete") return;
        window.clearTimeout(timeout);
        pc.removeEventListener("icegatheringstatechange", done);
        resolve();
      }
      pc.addEventListener("icegatheringstatechange", done);
      done();
    });
  }

  async function start() {
    if (phase === "starting" || phase === "live" || phase === "stopping")
      return;
    if (availabilityState !== "ready") {
      void refreshAvailability();
      return;
    }
    // Eine neue Hörprobe beendet jede ältere lokale Wiedergabe vor dem Mikrofonzugriff.
    beginAudioPreview();
    const generation = ++generationRef.current;
    setPhase("starting");
    setAvailabilityState("checking");
    setStatus("Verfügbarkeit wird vor dem Start erneut geprüft …");
    setTranscript([]);
    let run: Run | null = null;
    let requestController: AbortController | null = null;
    try {
      const statusController = new AbortController();
      requestController = statusController;
      startRequestRef.current = statusController;
      const { result: availability } = await fetchJsonWithTimeout(
        "/api/live-demo/status",
        {},
        { signal: statusController.signal, label: "Die Verfügbarkeitsprüfung" },
      );
      if (startRequestRef.current === statusController)
        startRequestRef.current = null;
      if (generation !== generationRef.current) return;
      const unavailable = unavailableLiveDemoMessage(availability);
      if (unavailable) {
        setAvailabilityState("blocked");
        const enabled = Boolean(
          availability && typeof availability === "object" &&
          (availability as Record<string, unknown>).enabled === true,
        );
        setPhase(enabled ? "error" : "disabled");
        setStatus(unavailable);
        return;
      }
      setAvailabilityState("ready");
      setStatus("Mikrofon und sichere Verbindung werden vorbereitet …");
      const pc = new RTCPeerConnection();
      const dc = pc.createDataChannel("oai-events");
      run = {
        pc,
        dc,
        mic: null,
        sessionId: "",
        generation,
        stopGeneration: null,
        audio: null,
        timer: null,
        stopTimer: null,
        closeRequested: false,
      };
      activeRunRef.current = run;
      runsRef.current.add(run);
      const currentRun = run;
      pc.ontrack = (event) => {
        if (activeRunRef.current !== currentRun) return;
        const audio = new Audio();
        audioRef.current = audio;
        currentRun.audio = audio;
        audio.autoplay = true;
        audio.srcObject = new MediaStream([event.track]);
        void playLiveDemoAudio(audio, () => {
          if (activeRunRef.current !== currentRun || generationRef.current !== currentRun.generation) return;
          setStatus("Audio bitte aktivieren, damit Sie Silvia hören können.");
        });
      };
      dc.onmessage = (event) => {
        let message: LiveEvent;
        try {
          message = JSON.parse(String(event.data)) as LiveEvent;
        } catch {
          return;
        }
        if (message.type !== "session.closed" &&
            (activeRunRef.current !== currentRun || generationRef.current !== currentRun.generation)) return;
        if (message.type === "session.started") {
          setPhase("live");
          setStatus("Verbunden mit OpenAI · ausschließlich erfundene Demo-Inhalte nennen");
        }
        if (message.type === "session.input_transcript.delta" && message.delta)
          setTranscript((items) => mergeTranscriptDelta(items, message));
        if (message.type === "session.output_transcript.delta" && message.delta)
          setTranscript((items) => mergeTranscriptDelta(items, message));
        if (message.type === "session.closed") {
          const wasCurrentRun = activeRunRef.current === currentRun;
          const wasStopping = currentRun.stopGeneration !== null;
          const isCurrentGeneration = generationRef.current === (currentRun.stopGeneration ?? currentRun.generation);
          if (!runsRef.current.has(currentRun)) return;
          clearRun(currentRun);
          if ((wasCurrentRun || wasStopping) && isCurrentGeneration) {
            setPhase("ended");
            setStatus("Hörprobe beendet.");
          }
        }
        if (message.type === "error") {
          // Ein Anbieterfehler beendet die Übertragung sofort. Der nächste
          // Start holt den Serverstatus neu ab und bleibt bis zur bestätigten
          // Beendigung gesperrt.
          discardRun(currentRun, true);
          setPhase("error");
          setStatus(
            "Die Live-Verbindung ist fehlgeschlagen. Bitte später erneut versuchen.",
          );
        }
      };
      dc.onclose = () => {
        if (!runsRef.current.has(currentRun)) return;
        const wasCurrentRun = activeRunRef.current === currentRun;
        const wasStopping = currentRun.stopGeneration !== null;
        const isCurrentGeneration = generationRef.current === (currentRun.stopGeneration ?? currentRun.generation);
        if (!currentRun.closeRequested) closeServer(currentRun);
        clearRun(currentRun);
        if ((wasCurrentRun || wasStopping) && isCurrentGeneration) {
          setPhase("error");
          setStatus(
            wasStopping
              ? "Stoppsignal nicht bestätigt; Sitzung bleibt vorsichtshalber unsicher."
              : "Live-Verbindung unerwartet beendet; Sitzung bleibt vorsichtshalber unsicher.",
          );
        }
      };
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      run.mic = mic;
      if (
        generation !== generationRef.current ||
        activeRunRef.current !== run
      ) {
        discardRunAfterStop(run);
        return;
      }
      mic.getAudioTracks().forEach((track) => pc.addTrack(track, mic));
      await pc.setLocalDescription(await pc.createOffer());
      await waitForIce(pc);
      const sdp = pc.localDescription?.sdp;
      if (!sdp) throw new Error("Kein SDP-Angebot");
      if (
        generation !== generationRef.current ||
        activeRunRef.current !== run
      ) {
        discardRunAfterStop(run);
        return;
      }
      const createController = new AbortController();
      requestController = createController;
      startRequestRef.current = createController;
      const { response, result } = await fetchJsonWithTimeout(
        "/api/live-demo/create",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sdp }),
        },
        {
          signal: createController.signal,
          label: "Der Start der Live-Verbindung",
          timeoutMs: LIVE_DEMO_REQUEST_TIMEOUT_MS,
        },
      );
      if (startRequestRef.current === createController)
        startRequestRef.current = null;
      if (!response.ok)
        throw new Error(String(result.error ?? "Start fehlgeschlagen"));
      run.sessionId = String(result.session?.id ?? "");
      if (
        generation !== generationRef.current ||
        activeRunRef.current !== run
      ) {
        discardRunAfterStop(run);
        return;
      }
      await pc.setRemoteDescription({
        type: "answer",
        sdp: result.transport.sdp,
      });
      if (
        generation !== generationRef.current ||
        activeRunRef.current !== run
      ) {
        discardRunAfterStop(run);
        return;
      }
      run.timer = window.setTimeout(() => void stop(run), MAX_MS);
    } catch (error) {
      if (startRequestRef.current === requestController) {
        requestController?.abort();
        startRequestRef.current = null;
      }
      if (generation !== generationRef.current) {
        if (run) discardRunAfterStop(run);
        return;
      }
      if (!run) {
        setAvailabilityState("failed");
        setPhase("error");
        setStatus(
          error instanceof TypeError
            ? "Die Live-Verbindung ist derzeit nicht erreichbar. Bitte später erneut versuchen."
            : "Die Live-Hörprobe konnte nicht gestartet werden.",
        );
        return;
      }
      if (activeRunRef.current !== run)
        return;
      discardRun(run, true);
      setPhase("error");
      setStatus(
        error instanceof TypeError
          ? "Die Live-Verbindung ist derzeit nicht erreichbar. Bitte später erneut versuchen."
          : "Die Live-Hörprobe konnte nicht gestartet werden. Bitte später erneut versuchen.",
      );
    }
  }

  async function stop(expectedRun = activeRunRef.current) {
    const run = expectedRun;
    if (!run) {
      if (phase === "starting") {
        generationRef.current += 1;
        startRequestRef.current?.abort();
        startRequestRef.current = null;
        setPhase("ended");
        setStatus("Hörprobe abgebrochen.");
      }
      return;
    }
    if (activeRunRef.current !== run) return;
    run.stopGeneration = ++generationRef.current;
    // A create request may already have reached the server. Let it finish so
    // its late session id can still be closed by discardRunAfterStop().
    // The status request has no run and is aborted by the branch above.
    const createInFlight = !run.sessionId && startRequestRef.current;
    if (!createInFlight) {
      startRequestRef.current?.abort();
      startRequestRef.current = null;
    }
    activeRunRef.current = null;
    setPhase("stopping");
    setStatus("Hörprobe wird beendet …");
    run.mic?.getTracks().forEach((track) => track.stop());
    run.mic = null;
    try {
      if (run.dc.readyState === "open")
        run.dc.send(JSON.stringify({ type: "session.close" }));
    } catch {
      /* connection is already gone */
    }
    closeServer(run);
    const stopGeneration = run.stopGeneration;
    run.stopTimer = window.setTimeout(() => {
      if (runsRef.current.has(run)) {
        discardRun(run);
        if (generationRef.current === stopGeneration) {
          setPhase("error");
          setStatus(
            "Stoppsignal nicht bestätigt; Sitzung bleibt vorsichtshalber unsicher.",
          );
        }
      }
    }, 3_000);
  }

  stopRef.current = stop;

  return (
    <section
      id="silvia-live-demo"
      className="mx-auto mt-6 max-w-2xl rounded-xl border border-primary/20 bg-card p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Interaktive Live-Hörprobe · GPT-Live-1 · Marin
          </p>
          <h2 className="mt-1 font-display text-xl">
            Eine kurze echte Live-Stimme
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Echte GPT-Live-1-Hörprobe: Ihr Mikrofonton wird an OpenAI
            übertragen, nicht lokal verarbeitet. Nennen Sie ausschließlich
            erfundene Inhalte – keine echten Namen, Kontaktdaten oder
            Praxisinformationen. Keine Buchung und keine Werkzeuge mit Zugriff
            auf die Praxis. Das Zeitlimit ist keine globale Kosten-Garantie.
          </p>
        </div>
        {phase === "live" ? (
          <Phone className="size-5 text-ok" aria-label="Verbunden" />
        ) : (
          <Mic className="size-5 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <p id="silvia-live-demo-status" className="mt-3 text-sm" role="status">
        {status}
      </p>
      {transcript.length ? (
        <div className="mt-3 max-h-32 overflow-auto rounded-md bg-muted/50 p-3 text-sm">
          {transcript.slice(-8).map((line) => (
            <p key={line.key}>{line.speaker}: {line.text}</p>
          ))}
        </div>
      ) : null}
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={syntheticOnlyConfirmed}
          onChange={(event) => setSyntheticOnlyConfirmed(event.currentTarget.checked)}
          className="mt-1 size-4 shrink-0"
        />
        <span>Ich bestätige: Ich nenne ausschließlich erfundene Demo-Inhalte.</span>
      </label>
      <div className="mt-4 flex gap-2">
        {phase === "live" || phase === "starting" ? (
          <Button
            type="button"
            variant="destructive"
            onClick={() => void stop()}
          >
            <PhoneOff /> Stoppen
          </Button>
        ) : availabilityState === "ready" ? (
          <Button
            type="button"
            onClick={() => void start()}
            disabled={phase === "stopping" || !syntheticOnlyConfirmed}
          >
            <Mic /> Hörprobe starten
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => void refreshAvailability()}
            disabled={availabilityState === "checking" || phase === "stopping"}
          >
            <Mic />
            {availabilityState === "checking"
              ? "Verfügbarkeit wird geprüft …"
              : "Verfügbarkeit erneut prüfen"}
          </Button>
        )}
      </div>
      <audio
        ref={audioRef}
        className="sr-only"
        aria-label="Silvia Live Audio"
      />
    </section>
  );
}
