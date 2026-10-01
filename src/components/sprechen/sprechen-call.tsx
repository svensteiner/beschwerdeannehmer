import { Link, useRouter } from "@tanstack/react-router";
import { Mic, Phone, Volume2, VolumeX } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PhoneShell, Waveform } from "@/components/phone-frame";
import { SilviaAvatar } from "@/components/silvia-avatar";
import { readStoredAvatar } from "@/components/silvia-avatar-storage";
import { VoicePicker } from "@/components/silvia-voice";
import { SilviaVarianten } from "@/components/silvia-varianten";
import { Button } from "@/components/ui/button";
import {
  ASK_CLIENT_TIMEOUT_MS,
  askAlma,
  type ChatTurn,
} from "@/lib/alma/ask-alma";
import { beginAudioPreview, startAudioPreview } from "@/lib/alma/audio-preview";
import { llmSourceLabel, type LlmSourceView } from "@/lib/alma/llm-source";
import { PRACTICE, SUGGESTED_PROMPTS } from "@/lib/alma/data";
import {
  avatarForPlace,
  liveAvatarStorageKey,
  type AvatarId,
} from "@/lib/alma/avatars";
import {
  deskCityLabel,
  deskFromProfile,
  deskLineNumber,
  deskWhatsappNumber,
  greetingFor,
  livePersistStaffNote,
  spokenNachtdienstDest,
} from "@/lib/alma/desk";
import { greetingWithConsent } from "@/lib/alma/consent";
import { writeToBoard } from "@/lib/alma/board";
import {
  loadSprechenDrafts,
  markThreadRead,
  persistBoardEvent,
} from "@/lib/practice/board";
import {
  rememberPracticeFact,
  replacePracticeFact,
} from "@/lib/practice/facts";
import {
  updateAppointmentStatus,
  updateCallStatus,
} from "@/lib/practice/desk-actions";
import {
  internSettingsTarget,
  type LiveInternDraft,
} from "@/lib/practice/desk-calls";
import type { PracticeProfile } from "@/lib/practice/profile";
import {
  deskDraftStorage,
  draftsAfterNewCall,
  mergeSprechenDraftIds,
  readSprechenDraftIds,
  writeSprechenDraftIds,
} from "@/lib/practice/sprechen-drafts";
import {
  confirmDraftToast,
  confirmReachHint,
  needsSilentConfirm,
  type DraftChannel,
  type LastWalkIn,
  type LiveKassaDraft,
  type LiveReachDraft,
} from "@/lib/practice/walk-in-last";
import { DeskDraftButton } from "@/components/desk/desk-draft-button";
import { AkteHandyLink } from "@/components/desk/akte-handy-link";
import { HalterinReach } from "@/components/desk/halterin-reach";
import { NachtdienstReach } from "@/components/desk/nachtdienst-reach";
import {
  emergencyToast,
  nachtdienstDraft,
  nachtdienstReachCopy,
  slotSpokenName,
} from "@/lib/alma/protocol";
import {
  BARGE_RMS,
  LISTEN_MAX_MS,
  LISTEN_MIN_MS,
  LISTEN_QUIET_BYTES,
  LISTEN_SILENCE_MS,
  isSilentRms,
  shouldBargeIn,
  shouldStopListen,
} from "@/lib/alma/listen";
import {
  GREETING,
  TTS_CLIENT_TIMEOUT_MS,
  TTS_FAIL_TOAST_ID,
  speakAlma,
  speechChunks,
  ttsFailToast,
} from "@/lib/alma/speak";
import { MAX_TRAINED_FACTS, useAlmaStore } from "@/lib/alma/store";
import { trainedGreetingFromFacts } from "@/lib/alma/trained-greeting";
import { IDENT_GREETING_SUFFIX } from "@/lib/alma/identify";
import { MicSilenceWatch } from "@/lib/alma/mic-silence";
import {
  isCurrentCallSession,
  isCurrentRecordingSession,
  stopMediaStreamTracks,
} from "@/lib/alma/call-session";
import {
  STT_FAIL_TOAST_ID,
  STT_CLIENT_TIMEOUT_MS,
  sttFailFromTranscribe,
  sttFailToast,
  type SttFailReason,
} from "@/lib/alma/stt";
import { transcribeAlma } from "@/lib/alma/transcribe";
import {
  extractTrainFact,
  isSpeechRecognitionTrainingInput,
  trainPromptsFor,
  trainingGreetingFor,
  type TrainingKind,
} from "@/lib/alma/train";
import { reportHoerKorrektur } from "@/lib/alma/hoer-log-fn";
import {
  hoerCorrectionSignature,
  needsHoerCorrection,
  requestIdForSignature,
  reportHoerCorrectionSafely,
} from "@/lib/alma/hoer-correction";
import {
  normalizeDemoSpeechTerms,
  readDemoSpeechTerms,
  writeDemoSpeechTerms,
} from "@/lib/alma/demo-speech";
import { greetingSrc, voicePreviewText } from "@/lib/alma/voices";
import {
  TAFEL_ANZEIGE_LINE,
  anzeigeControl,
} from "@/lib/practice/tafel-anzeige";
import { cn } from "@/lib/utils";
import { SilviaLiveDemo } from "@/components/sprechen/silvia-live-demo";
import {
  MIC_AUDIO,
  MIC_GAIN,
  MIC_LIMITER,
  conversationStatusText,
  nextTrainingPlaceholder,
  playFile,
  startAudioPlayback,
  stopAudio,
  waitForAudioPlayback,
  type LastTrainingFact,
  type Line,
  type Phase,
} from "@/components/sprechen/sprechen-call-helpers";

export function SprechenCall({
  profile = null,
  inboundSlug,
  layout = "page",
  forceDemo = false,
  anzeige = false,
  initialTrainMode = false,
  initialTrainingKind = "wissen",
  testMode = false,
}: {
  profile?: PracticeProfile | null;
  inboundSlug?: string;
  layout?: "page" | "embed";
  forceDemo?: boolean;
  anzeige?: boolean;
  initialTrainMode?: boolean;
  initialTrainingKind?: TrainingKind;
  /** Testet mit echten Praxisregeln, schreibt aber nichts auf die Tafel. */
  testMode?: boolean;
}) {
  const router = useRouter();
  const desk = !forceDemo && profile ? deskFromProfile(profile) : null;
  const live = Boolean(desk);
  const inbound = Boolean(inboundSlug) && !forceDemo;
  const allowTrain = !inbound;
  const liveAvatarPreferred =
    live && desk ? avatarForPlace(desk.city, desk.bundesland) : undefined;
  const liveAvatarKey =
    live && profile?.id
      ? liveAvatarStorageKey(profile.id)
      : live && desk
        ? liveAvatarStorageKey(desk.name)
        : "";
  const [liveAvatar, setLiveAvatar] = useState<AvatarId | undefined>(
    liveAvatarPreferred,
  );
  const [trainMode, setTrainMode] = useState(initialTrainMode && !anzeige);
  const [trainingKind, setTrainingKind] =
    useState<TrainingKind>(initialTrainingKind);
  const training = allowTrain && trainMode && !anzeige;
  const demoSpeech = forceDemo || !live;
  const [demoSpeechTerms, setDemoSpeechTerms] = useState<string[]>([]);
  useEffect(() => {
    if (demoSpeech) setDemoSpeechTerms(readDemoSpeechTerms());
  }, [demoSpeech]);
  const trainedFacts = useAlmaStore((s) => s.trainedFacts);
  const demoGreeting =
    forceDemo || (!live && !inbound)
      ? trainedGreetingFromFacts(trainedFacts)
      : null;
  const greeting = training
    ? trainingGreetingFor(
        trainingKind,
        desk?.shortName ?? (forceDemo ? "Huber" : undefined),
      )
    : demoGreeting
      ? `${demoGreeting}${/[.!?]$/.test(demoGreeting) ? "" : "."}${IDENT_GREETING_SUFFIX}`
      : desk
        ? greetingWithConsent(greetingFor(desk), desk)
        : GREETING;
  const [phase, setPhase] = useState<Phase>("idle");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [micOk, setMicOk] = useState(true);
  const [sttNote, setSttNote] = useState<string | null>(null);
  const [boardNote, setBoardNote] = useState<string | null>(null);
  const [boardLinks, setBoardLinks] = useState<"anrufe" | "tafel">("tafel");
  const [llmSource, setLlmSource] = useState<LlmSourceView | null>(null);
  const [liveConfirm, setLiveConfirm] = useState<LastWalkIn | null>(null);
  const [liveIntern, setLiveIntern] = useState<LiveInternDraft | null>(null);
  const [liveReach, setLiveReach] = useState<LiveReachDraft | null>(null);
  const [liveKassa, setLiveKassa] = useState<LiveKassaDraft | null>(null);
  const [nightCase, setNightCase] = useState(false);
  const voiceId = useAlmaStore((s) => s.voiceId);
  const edition = useAlmaStore((s) => s.edition);
  const kbPatients = useAlmaStore((s) => s.kbPatients);
  const addTrainedFact = useAlmaStore((s) => s.addTrainedFact);
  const replaceTrainedFact = useAlmaStore((s) => s.replaceTrainedFact);
  const removeTrainedFact = useAlmaStore((s) => s.removeTrainedFact);
  const hydrateTrainedFacts = useAlmaStore((s) => s.hydrateTrainedFacts);
  useEffect(() => {
    void hydrateTrainedFacts();
  }, [hydrateTrainedFacts]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const sttRequestRef = useRef<AbortController | null>(null);
  const askRequestRef = useRef<AbortController | null>(null);
  const ttsRequestsRef = useRef(new Map<number, Set<AbortController>>());
  const listenStreamRef = useRef<MediaStream | null>(null);
  const listenCtxRef = useRef<AudioContext | null>(null);
  const listenRafRef = useRef(0);
  const listenGenRef = useRef(0);
  // Eine neue Anrufnummer macht alle noch laufenden Antworten des alten
  // Gespraechs ungültig (z. B. nach Auflegen und erneutem Anrufen).
  const callGenRef = useRef(0);
  const mountedRef = useRef(true);
  const voiceGenRef = useRef(0);
  const bargeRef = useRef(false);
  const bargeCtxRef = useRef<AudioContext | null>(null);
  const bargeRafRef = useRef(0);
  const bargeStreamRef = useRef<MediaStream | null>(null);
  const pendingListenStreamRef = useRef<MediaStream | null>(null);
  const greetedRef = useRef(false);
  const listenAfterRef = useRef(false);
  // AP 58: Korrektur nur auf Wunsch — "Korrigieren" an der letzten User-Blase
  // merkt sich den gehoerten Original-Text hier, um ihn beim Senden mit dem
  // (moeglicherweise editierten) Input zu vergleichen und bei Abweichung
  // reportHoerKorrektur() auszuloesen. Kein State (kein Re-Render fuer den Vergleich noetig).
  const heardForCheckRef = useRef<string | null>(null);
  const correctionRequestRef = useRef<{
    signature: string;
    requestId: string;
  } | null>(null);
  const trainingInputRef = useRef<HTMLInputElement | null>(null);
  // AP 58: steuert nur die UI (Hinweistext + Senden-Button) beim Korrigieren-Flow.
  const [correcting, setCorrecting] = useState(false);
  const [lastTrainingFact, setLastTrainingFact] =
    useState<LastTrainingFact | null>(null);
  // While recording via the server path: tracks continuous silence so we can
  // show a visible error instead of failing silently (see mic-silence.ts).
  const micSilenceRef = useRef<MicSilenceWatch | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const linesRef = useRef<Line[]>([]);
  const userLineIdRef = useRef(0);
  linesRef.current = lines;
  const remaining = 12 - lines.filter((l) => l.role === "user").length;
  const busyRef = useRef(false);
  busyRef.current = busy;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const speakerRef = useRef(speaker);
  speakerRef.current = speaker;
  const remainingRef = useRef(remaining);
  remainingRef.current = remaining;
  const draftsGen = useRef(0);
  const unmountCleanupRef = useRef<() => void>(() => undefined);

  const emergency = useMemo(
    () =>
      nightCase ||
      lines.some(
        (l) =>
          l.role === "assistant" &&
          /das klingt nach einem notfall|ich verbinde sie jetzt|notaufnahme kleintier/i.test(
            l.content,
          ),
      ),
    [lines, nightCase],
  );

  useEffect(() => {
    if (anzeige) setTrainMode(false);
  }, [anzeige]);

  useEffect(() => {
    if (initialTrainMode && !anzeige) {
      setTrainMode(true);
      setTrainingKind(initialTrainingKind);
    }
  }, [initialTrainMode, initialTrainingKind, anzeige]);

  useEffect(() => {
    if (!live || inbound || forceDemo) return;
    const ids = readSprechenDraftIds(deskDraftStorage());
    if (!ids) return;
    const gen = draftsGen.current;
    void loadSprechenDrafts({ data: ids })
      .then((res) => {
        if (gen !== draftsGen.current) return;
        if (!res.ok) return;
        if (res.confirm) setLiveConfirm(res.confirm);
        if (res.intern) setLiveIntern(res.intern);
        if (res.reach) setLiveReach(res.reach);
        if (res.kassa) setLiveKassa(res.kassa);
        else if (ids.kassaId) setLiveKassa(null);
      })
      .catch(() => undefined);
  }, [live, inbound, forceDemo]);

  useLayoutEffect(() => {
    if (!liveAvatarPreferred) {
      setLiveAvatar(undefined);
      return;
    }
    setLiveAvatar(readStoredAvatar(liveAvatarKey) ?? liveAvatarPreferred);
  }, [liveAvatarKey, liveAvatarPreferred]);

  useEffect(() => {
    if (phase !== "live") return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "ringing") return;
    const id = window.setTimeout(() => {
      setLines([{ role: "assistant", content: greeting }]);
      setPhase("live");
    }, 2000);
    return () => window.clearTimeout(id);
  }, [phase, greeting]);

  useEffect(() => {
    if (phase !== "live") return;
    if (!speaker) return;
    if (greetedRef.current) return;
    if (lines.length !== 1 || lines[0]?.role !== "assistant") return;
    greetedRef.current = true;
    if (live || voiceId === "ara" || greeting !== GREETING) {
      listenAfterRef.current = true;
      void voice(greeting);
      return;
    }
    // Die Standardstimme spricht auch die Begrüßung dynamisch, damit kein Stimmenwechsel
    // entsteht. Andere Demo-Stimmen behalten nur für die unveränderte
    // Standardbegrüßung ihre vorhandene Aufnahme.
    listenAfterRef.current = true;
    const greetingCallGen = callGenRef.current;
    const audio = playFile(audioRef, greetingSrc(voiceId), 1);
    audio.onended = () => {
      if (audioRef.current !== audio || greetingCallGen !== callGenRef.current)
        return;
      startListen();
    };
    // startListen and voice are function declarations in this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, speaker, lines, voiceId, live, greeting]);

  unmountCleanupRef.current = () => {
    mountedRef.current = false;
    callGenRef.current += 1;
    invalidateVoiceGeneration();
    stopAudio(audioRef);
    stopBargeWatch();
    stopPendingListenStream();
    stopListen();
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => unmountCleanupRef.current();
  }, []);

  function stopBargeAnalyser() {
    if (bargeRafRef.current) {
      window.cancelAnimationFrame(bargeRafRef.current);
      bargeRafRef.current = 0;
    }
    if (bargeCtxRef.current) {
      void bargeCtxRef.current.close().catch(() => undefined);
      bargeCtxRef.current = null;
    }
  }

  function stopPendingListenStream() {
    pendingListenStreamRef.current?.getTracks().forEach((t) => t.stop());
    pendingListenStreamRef.current = null;
  }

  function stopBargeWatch() {
    stopBargeAnalyser();
    bargeStreamRef.current?.getTracks().forEach((t) => t.stop());
    bargeStreamRef.current = null;
  }

  function cancelVoice() {
    invalidateVoiceGeneration();
    bargeRef.current = false;
    stopBargeWatch();
    stopPendingListenStream();
    stopAudio(audioRef);
    setSpeaking(false);
  }

  function abortVoiceRequests(gen?: number) {
    for (const [requestGen, controllers] of ttsRequestsRef.current) {
      if (gen !== undefined && requestGen !== gen) continue;
      controllers.forEach((controller) => controller.abort());
      ttsRequestsRef.current.delete(requestGen);
    }
  }

  function invalidateVoiceGeneration() {
    voiceGenRef.current += 1;
    abortVoiceRequests();
    return voiceGenRef.current;
  }

  function requestVoiceChunk(text: string, gen: number) {
    const controller = new AbortController();
    const controllers =
      ttsRequestsRef.current.get(gen) ?? new Set<AbortController>();
    controllers.add(controller);
    ttsRequestsRef.current.set(gen, controllers);
    const timeout = window.setTimeout(
      () => controller.abort(),
      TTS_CLIENT_TIMEOUT_MS,
    );
    // Der Rejecthandler hängt sofort am vorgeladenen Folgechunk: Ein Abbruch
    // während der aktuellen WAV-Wiedergabe darf keine unbehandelte Promise
    // hinterlassen.
    return speakAlma({
      data: { text, voice: voiceId },
      signal: controller.signal,
    })
      .catch(() => null)
      .finally(() => {
        window.clearTimeout(timeout);
        controllers.delete(controller);
        if (!controllers.size) ttsRequestsRef.current.delete(gen);
      });
  }

  function startBargeWatch(gen: number) {
    stopBargeWatch();
    bargeRef.current = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: MIC_AUDIO,
        });
        if (gen !== voiceGenRef.current || phaseRef.current !== "live") {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        bargeStreamRef.current = stream;
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioCtx) {
          stream.getTracks().forEach((t) => t.stop());
          bargeStreamRef.current = null;
          return;
        }
        const ctx = new AudioCtx();
        bargeCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        const started = Date.now();
        let loudSince: number | null = null;
        const tick = () => {
          if (gen !== voiceGenRef.current || bargeCtxRef.current !== ctx)
            return;
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const x of samples) sum += x * x;
          const rms = Math.sqrt(sum / samples.length);
          if (!isSilentRms(rms, BARGE_RMS)) {
            if (loudSince == null) loudSince = Date.now();
          } else {
            loudSince = null;
          }
          if (
            shouldBargeIn({
              elapsedMs: Date.now() - started,
              loudForMs: loudSince == null ? 0 : Date.now() - loudSince,
            })
          ) {
            bargeRef.current = true;
            abortVoiceRequests(gen);
            stopAudio(audioRef);
            pendingListenStreamRef.current = stream;
            bargeStreamRef.current = null;
            stopBargeAnalyser();
            return;
          }
          bargeRafRef.current = window.requestAnimationFrame(tick);
        };
        bargeRafRef.current = window.requestAnimationFrame(tick);
      } catch {
        /* Mikrofon gesperrt — Barge-in bleibt aus, tippen geht weiter. */
      }
    })();
  }

  function stopListen() {
    listenGenRef.current += 1;
    sttRequestRef.current?.abort();
    sttRequestRef.current = null;
    askRequestRef.current?.abort();
    askRequestRef.current = null;
    if (listenRafRef.current) {
      window.cancelAnimationFrame(listenRafRef.current);
      listenRafRef.current = 0;
    }
    if (listenCtxRef.current) {
      void listenCtxRef.current.close().catch(() => undefined);
      listenCtxRef.current = null;
    }
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      try {
        mediaRef.current.stop();
      } catch {
        /* already stopped */
      }
    }
    mediaRef.current = null;
    stopMediaStreamTracks(listenStreamRef.current);
    listenStreamRef.current = null;
    micSilenceRef.current = null;
    setListening(false);
  }

  function noteSttFail(reason: SttFailReason) {
    const text = sttFailToast(reason);
    setSttNote(text);
    toast.error(text, { id: STT_FAIL_TOAST_ID });
  }

  function startListen(existing?: MediaStream | null) {
    if (
      phaseRef.current !== "live" ||
      busyRef.current ||
      remainingRef.current <= 0
    ) {
      existing?.getTracks().forEach((t) => t.stop());
      if (!existing) stopPendingListenStream();
      return;
    }
    const handed = existing ?? pendingListenStreamRef.current;
    pendingListenStreamRef.current = null;
    invalidateVoiceGeneration();
    bargeRef.current = false;
    stopBargeWatch();
    stopAudio(audioRef);
    setSpeaking(false);
    stopListen();
    // Auch während die Mikrofonfreigabe noch wartet, muss der Primärknopf
    // sichtbar abbrechbar sein.
    setListening(true);
    const gen = listenGenRef.current;
    const callGen = callGenRef.current;
    setHeard("");
    setSttNote(null);
    void startRecordFallback(handed ?? undefined, gen, callGen);
  }

  async function startRecordFallback(
    existing?: MediaStream,
    gen = listenGenRef.current,
    callGen = callGenRef.current,
  ) {
    let stream: MediaStream | undefined = existing;
    let gainCtx: AudioContext | null = null;
    let recorder: MediaRecorder | null = null;
    try {
      stream ??= await navigator.mediaDevices.getUserMedia({
        audio: MIC_AUDIO,
      });
      // Die Freigabe des Mikrofons kann erst nach Auflegen eintreffen. Dann
      // darf keine neue Aufnahme mehr beginnen und es darf nichts hochladen.
      if (
        !isCurrentRecordingSession({
          listenGeneration: gen,
          currentListenGeneration: listenGenRef.current,
          callGeneration: callGen,
          currentCallGeneration: callGenRef.current,
          phase: phaseRef.current,
        })
      ) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      // Verstaerkter und begrenzter Stream fuer den Recorder; ohne AudioContext roh.
      const AudioCtxEarly =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      let recStream: MediaStream = stream;
      let gainedSource: MediaStreamAudioSourceNode | null = null;
      if (AudioCtxEarly) {
        gainCtx = new AudioCtxEarly();
        const src = gainCtx.createMediaStreamSource(stream);
        const gain = gainCtx.createGain();
        gain.gain.value = MIC_GAIN;
        const compressor = gainCtx.createDynamicsCompressor();
        compressor.threshold.value = MIC_LIMITER.threshold;
        compressor.knee.value = MIC_LIMITER.knee;
        compressor.ratio.value = MIC_LIMITER.ratio;
        compressor.attack.value = MIC_LIMITER.attack;
        compressor.release.value = MIC_LIMITER.release;
        const dest = gainCtx.createMediaStreamDestination();
        src.connect(gain);
        gain.connect(compressor);
        compressor.connect(dest);
        recStream = dest.stream;
        gainedSource = gainCtx.createMediaStreamSource(dest.stream);
      }
      const rec = new MediaRecorder(recStream, { mimeType: mime });
      recorder = rec;
      listenStreamRef.current = stream;
      // Jede Aufnahme besitzt ihren eigenen Puffer. So kann ein spaetes onstop
      // einer alten Aufnahme niemals die Daten einer neuen Aufnahme versenden.
      const chunks: Blob[] = [];
      const micSilence = new MicSilenceWatch();
      micSilenceRef.current = micSilence;
      let silenceTripped = false;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        const ownsRecorder = mediaRef.current === rec;
        if (ownsRecorder && listenRafRef.current) {
          window.cancelAnimationFrame(listenRafRef.current);
          listenRafRef.current = 0;
        }
        if (listenCtxRef.current === gainCtx) {
          void gainCtx?.close().catch(() => undefined);
          listenCtxRef.current = null;
        } else {
          void gainCtx?.close().catch(() => undefined);
        }
        if (micSilenceRef.current === micSilence) micSilenceRef.current = null;
        stopMediaStreamTracks(stream);
        if (listenStreamRef.current === stream) listenStreamRef.current = null;
        if (ownsRecorder) mediaRef.current = null;
        const stillCurrent = isCurrentRecordingSession({
          listenGeneration: gen,
          currentListenGeneration: listenGenRef.current,
          callGeneration: callGen,
          currentCallGeneration: callGenRef.current,
          phase: phaseRef.current,
          ownsRecorder,
        });
        if (!stillCurrent || silenceTripped) {
          // Already surfaced "Mikrofon liefert keinen Ton" — don't also
          // report the (misleading) generic "zu leise" from an empty blob.
          return;
        }
        const blob = new Blob(chunks, { type: mime });
        void sendRecording(blob, gen, callGen);
      };
      mediaRef.current = rec;
      rec.start(250);
      setListening(true);
      setMicOk(true);
      if (gainCtx && gainedSource) {
        const ctx = gainCtx;
        listenCtxRef.current = ctx;
        // Pegel NACH der Verstaerkung messen — dieselben Samples, die der Recorder bekommt.
        const source = gainedSource;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        const started = Date.now();
        let silentSince: number | null = null;
        const tick = () => {
          if (
            !isCurrentRecordingSession({
              listenGeneration: gen,
              currentListenGeneration: listenGenRef.current,
              callGeneration: callGen,
              currentCallGeneration: callGenRef.current,
              phase: phaseRef.current,
              ownsRecorder: mediaRef.current === rec,
            }) ||
            rec.state !== "recording"
          ) {
            return;
          }
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          let peak = 0;
          for (const x of samples) {
            sum += x * x;
            const abs = Math.abs(x);
            if (abs > peak) peak = abs;
          }
          const rms = Math.sqrt(sum / samples.length);
          const elapsed = Date.now() - started;
          if (isSilentRms(rms)) {
            if (silentSince == null) silentSince = Date.now();
          } else {
            silentSince = null;
          }
          const silentFor = silentSince == null ? 0 : Date.now() - silentSince;
          if (micSilence.sample(peak, elapsed)) {
            silenceTripped = true;
            const text =
              "Mikrofon liefert keinen Ton – in Windows prüfen (Stumm? Fernzugriff?)";
            setSttNote(text);
            toast.error(text, { id: STT_FAIL_TOAST_ID });
            try {
              rec.stop();
            } catch {
              /* already stopped */
            }
            return;
          }
          if (
            shouldStopListen({
              elapsedMs: elapsed,
              silentForMs: silentFor,
              maxMs: LISTEN_MAX_MS,
              silenceMs: LISTEN_SILENCE_MS,
              minMs: LISTEN_MIN_MS,
            })
          ) {
            try {
              rec.stop();
            } catch {
              /* already stopped */
            }
            return;
          }
          listenRafRef.current = window.requestAnimationFrame(tick);
        };
        listenRafRef.current = window.requestAnimationFrame(tick);
      } else {
        window.setTimeout(() => {
          if (
            isCurrentRecordingSession({
              listenGeneration: gen,
              currentListenGeneration: listenGenRef.current,
              callGeneration: callGen,
              currentCallGeneration: callGenRef.current,
              phase: phaseRef.current,
              ownsRecorder: mediaRef.current === rec,
            }) &&
            rec.state === "recording"
          ) {
            rec.stop();
          }
        }, LISTEN_MAX_MS);
      }
    } catch (error) {
      if (mediaRef.current === recorder) mediaRef.current = null;
      try {
        recorder?.stop();
      } catch {
        /* Recorder konnte nicht gestartet werden. */
      }
      stopMediaStreamTracks(stream);
      if (listenStreamRef.current === stream) listenStreamRef.current = null;
      void gainCtx?.close().catch(() => undefined);
      if (
        isCurrentRecordingSession({
          listenGeneration: gen,
          currentListenGeneration: listenGenRef.current,
          callGeneration: callGen,
          currentCallGeneration: callGenRef.current,
          phase: phaseRef.current,
        })
      ) {
        setMicOk(false);
        setListening(false);
        const name = error instanceof Error ? error.name : "";
        noteSttFail(
          name === "NotAllowedError" || name === "SecurityError"
            ? "not-allowed"
            : "error",
        );
      }
    }
  }

  async function sendRecording(blob: Blob, gen: number, callGen: number) {
    const isCurrentRecording = () =>
      isCurrentRecordingSession({
        listenGeneration: gen,
        currentListenGeneration: listenGenRef.current,
        callGeneration: callGen,
        currentCallGeneration: callGenRef.current,
        phase: phaseRef.current,
      });
    if (!isCurrentRecording()) return;
    setListening(false);
    if (blob.size < LISTEN_QUIET_BYTES) {
      noteSttFail("quiet");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const sttController = new AbortController();
    sttRequestRef.current = sttController;
    const sttTimeout = window.setTimeout(
      () => sttController.abort(),
      STT_CLIENT_TIMEOUT_MS,
    );
    try {
      const buf = await blob.arrayBuffer();
      if (!isCurrentRecording()) return;
      const bytes = new Uint8Array(buf);
      let binary = "";
      const step = 0x8000;
      for (let i = 0; i < bytes.length; i += step) {
        binary += String.fromCharCode(...bytes.subarray(i, i + step));
      }
      const res = await transcribeAlma({
        data: {
          audio: btoa(binary),
          mime: blob.type,
          line: inbound ? inboundSlug : undefined,
          demo: forceDemo || !live,
          demoTerms: demoSpeech ? readDemoSpeechTerms() : undefined,
        },
        signal: sttController.signal,
      });
      window.clearTimeout(sttTimeout);
      if (sttRequestRef.current === sttController) sttRequestRef.current = null;
      if (!isCurrentRecording()) return;
      if (res.ok && res.text) {
        // Bug 2026-09-10: busyRef wird erst beim naechsten Render aus dem State
        // gespiegelt — send() sah noch busy=true und brach still ab: Text erkannt,
        // aber keine Blase, keine Antwort. Ref hier sofort mitziehen.
        // Die Sperre bleibt bis zur Antwort von Silvia bestehen.
        // AP 58: freihändige Schulung — Pause heißt fertig, Silvia sendet
        // sofort. Der erkannte Text erscheint als User-Blase ("Silvia
        // schreibt mit"); Korrektur ist nur auf Wunsch über den
        // "Korrigieren"-Button an der letzten User-Blase möglich.
        await send(res.text, "speech", true);
        return;
      }
      const reason = sttFailFromTranscribe(res);
      // Kein Browser-SpeechRecognition-Fallback: dessen Verarbeitungsort ist
      // nicht nachweislich lokal. Tippen bleibt als Korrekturweg verfügbar.
      noteSttFail(reason);
    } catch (error) {
      if (isCurrentRecording())
        noteSttFail(
          error instanceof DOMException && error.name === "AbortError"
            ? "network"
            : "error",
        );
    } finally {
      window.clearTimeout(sttTimeout);
      if (sttRequestRef.current === sttController) sttRequestRef.current = null;
      if (isCurrentRecording()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  function onSilviaDone() {
    if (phaseRef.current !== "live") return;
    if (!listenAfterRef.current) return;
    startListen();
  }

  async function voice(text: string): Promise<boolean> {
    if (!speakerRef.current) {
      onSilviaDone();
      return false;
    }
    const chunks = speechChunks(text);
    if (!chunks.length) {
      onSilviaDone();
      return false;
    }
    const gen = invalidateVoiceGeneration();
    const previewGeneration = beginAudioPreview();
    bargeRef.current = false;
    setSpeaking(true);
    startBargeWatch(gen);
    let played = false;
    try {
      let pending = requestVoiceChunk(chunks[0] ?? "", gen);
      for (let i = 0; i < chunks.length; i++) {
        if (gen !== voiceGenRef.current || phaseRef.current !== "live")
          return played;
        if (bargeRef.current) break;
        const res = await pending;
        if (
          gen !== voiceGenRef.current ||
          phaseRef.current !== "live" ||
          bargeRef.current
        )
          return played;
        if (!res?.ok) {
          toast.error(ttsFailToast(), { id: TTS_FAIL_TOAST_ID });
          break;
        }
        stopAudio(audioRef);
        const audio = new Audio(res.audio);
        if (!startAudioPreview(audio, previewGeneration)) break;
        audioRef.current = audio;
        const playback = waitForAudioPlayback(
          audio,
          () =>
            bargeRef.current ||
            gen !== voiceGenRef.current ||
            audioRef.current !== audio,
        );
        if (!(await startAudioPlayback(audio, playback))) {
          toast.error(ttsFailToast(), { id: TTS_FAIL_TOAST_ID });
          break;
        }
        // Erst wenn dieser Satz wirklich gestartet ist, laden wir den naechsten
        // parallel. Auflegen invalidiert weiterhin dieselbe Generation und
        // bricht damit auch diesen vorgezogenen Request ab.
        if (i + 1 < chunks.length) {
          pending = requestVoiceChunk(chunks[i + 1] ?? "", gen);
        }
        const outcome = await playback.ended;
        if (outcome === "error") {
          toast.error(ttsFailToast(), { id: TTS_FAIL_TOAST_ID });
          break;
        }
        if (outcome === "cancel") break;
        played = true;
      }
    } catch {
      if (gen === voiceGenRef.current && !bargeRef.current) {
        toast.error(ttsFailToast(), { id: TTS_FAIL_TOAST_ID });
      }
    } finally {
      abortVoiceRequests(gen);
      if (gen === voiceGenRef.current) {
        stopBargeWatch();
        setSpeaking(false);
        if (bargeRef.current) {
          bargeRef.current = false;
          listenAfterRef.current = true;
          startListen(pendingListenStreamRef.current);
        } else {
          onSilviaDone();
        }
      }
    }
    return played;
  }

  async function send(
    text: string,
    origin: "speech" | "typed" = "typed",
    sttHandoff = false,
  ) {
    const trimmed = text.trim();
    if (
      !trimmed ||
      (!sttHandoff && busyRef.current) ||
      remainingRef.current <= 0 ||
      phaseRef.current !== "live"
    ) {
      return;
    }
    if (anzeige) {
      toast.error(TAFEL_ANZEIGE_LINE);
      return;
    }
    stopListen();
    cancelVoice();
    const callGen = callGenRef.current;
    const isCurrentCall = () =>
      isCurrentCallSession({
        callGeneration: callGen,
        currentCallGeneration: callGenRef.current,
        phase: phaseRef.current,
      });
    if (training || forceDemo) {
      heardForCheckRef.current = origin === "speech" ? trimmed : null;
      setCorrecting(false);
      if (origin !== "speech") setLastTrainingFact(null);
    }
    const userLine: Line = {
      id: `user-${++userLineIdRef.current}`,
      role: "user",
      content: trimmed,
    };
    const next: Line[] = [...linesRef.current, userLine];
    setLines(next);
    setInput("");
    setHeard("");
    busyRef.current = true;
    setBusy(true);
    if (training && trainingKind === "sprache" && origin !== "speech") {
      const reply =
        "Für das Sprachtraining sprechen Sie den Fachbegriff bitte ins Mikrofon. Eine Korrektur schreiben Sie danach über „Korrigieren“ ein.";
      setLines([...next, { role: "assistant", content: reply }]);
      setBoardNote("Sprachtraining: Fachbegriff bitte sprechen.");
      busyRef.current = false;
      setBusy(false);
      void voice(reply);
      return;
    }
    const speechRecognitionTraining =
      training && isSpeechRecognitionTrainingInput(trainingKind, origin);
    if (speechRecognitionTraining) {
      const tooLongForSpeechTraining = trimmed.length > 40;
      const reply = tooLongForSpeechTraining
        ? "Bitte sprechen Sie nur einen kurzen Fachbegriff mit höchstens 40 Zeichen. Er wird nicht als Praxisregel gespeichert."
        : `Ich habe „${trimmed}“ verstanden. Wenn das nicht stimmt, wählen Sie danach „Korrigieren“ und schreiben Sie den Fachbegriff.`;
      setLines([...next, { role: "assistant", content: reply }]);
      if (tooLongForSpeechTraining) {
        setBoardNote("Sprachtraining: Fachbegriff bitte kürzer sprechen.");
        busyRef.current = false;
        setBusy(false);
        void voice(reply);
        return;
      }
      setLastTrainingFact({
        source: trimmed,
        fact: "",
        lineId: userLine.id,
        speechOnly: true,
      });
      setBoardNote("Sprachtraining: Fachbegriff bei Bedarf korrigieren.");
      busyRef.current = false;
      setBusy(false);
      void voice(reply);
      return;
    }
    let askController: AbortController | null = null;
    let askTimeout: number | null = null;
    try {
      const messages: ChatTurn[] = next.map((l) => ({
        role: l.role,
        content: l.content,
      }));
      askController = new AbortController();
      askRequestRef.current = askController;
      askTimeout = window.setTimeout(
        () => askController?.abort(),
        ASK_CLIENT_TIMEOUT_MS,
      );
      const res = await askAlma({
        data: {
          messages,
          edition,
          kb: live ? [] : kbPatients,
          line: inbound ? inboundSlug : undefined,
          demo: forceDemo || (!live && !inbound),
          train: training,
          facts:
            forceDemo || (!live && !inbound)
              ? useAlmaStore.getState().trainedFacts
              : undefined,
          confirmId:
            live && !forceDemo && !inbound && !training
              ? (readSprechenDraftIds(deskDraftStorage())?.confirmId ?? "")
              : "",
        },
        signal: askController.signal,
      });
      window.clearTimeout(askTimeout);
      askTimeout = null;
      if (askRequestRef.current === askController) askRequestRef.current = null;
      if (!isCurrentCall()) return;
      let reply = res.text;
      const view = llmSourceLabel(res.source, res.provider);
      setLlmSource(view);
      if (!testMode && res.action.type === "emergency") setNightCase(true);
      let withReply = [
        ...next,
        {
          role: "assistant" as const,
          content: reply,
          sourceLabel: view.label,
          sourceFallback: view.fallback,
        },
      ];
      let internSkipped = false;
      let bookingConflict = false;
      if (
        !anzeige &&
        !training &&
        !testMode &&
        (inbound || (live && !forceDemo))
      ) {
        try {
          // AP 55: Begruessung wird immer als erste Assistenten-Zeile vorbelegt
          // (siehe setLines beim Verbindungsaufbau) — beim ersten echten Turn
          // stehen daher genau 2 Assistenten-Zeilen in withReply (Begruessung + diese
          // Antwort), nicht 1. Explizit an persistBoardEvent melden statt board.ts
          // die bruechige Laenge-<=1-Heuristik raten zu lassen.
          const firstTurn =
            withReply.filter((l) => l.role === "assistant").length === 2;
          const saved = await persistBoardEvent({
            data: {
              user: trimmed,
              reply,
              action: res.action,
              lines: withReply,
              line: inbound ? inboundSlug : undefined,
              confirmId:
                readSprechenDraftIds(deskDraftStorage())?.confirmId ?? "",
              firstTurn,
            },
          });
          if (!isCurrentCall()) return;
          if ("error" in saved && saved.error) {
            toast.error(saved.error);
          }
          if (
            "bookingConflict" in saved &&
            saved.bookingConflict &&
            "error" in saved &&
            saved.error
          ) {
            bookingConflict = true;
            reply = saved.error;
            withReply = [
              ...next,
              {
                role: "assistant" as const,
                content: reply,
                sourceLabel: view.label,
                sourceFallback: view.fallback,
              },
            ];
          }
          internSkipped = Boolean(
            saved.ok && "internSkipped" in saved && saved.internSkipped,
          );
          if (
            saved.ok &&
            "confirm" in saved &&
            saved.confirm &&
            !inbound &&
            live &&
            !forceDemo
          ) {
            setLiveConfirm(saved.confirm);
          }
          if (
            saved.ok &&
            "intern" in saved &&
            saved.intern &&
            !inbound &&
            live &&
            !forceDemo
          ) {
            setLiveIntern(saved.intern);
          }
          if (saved.ok && "reach" in saved && !inbound && live && !forceDemo) {
            setLiveReach(saved.reach ?? null);
          }
          if (
            saved.ok &&
            "kassa" in saved &&
            saved.kassa &&
            !inbound &&
            live &&
            !forceDemo
          ) {
            setLiveKassa(saved.kassa);
          }
          if (saved.ok && !inbound && live && !forceDemo) {
            const patch: {
              confirmId?: string;
              internId?: string;
              reachId?: string;
              kassaId?: string;
            } = {};
            if ("confirm" in saved && saved.confirm)
              patch.confirmId = saved.confirm.id;
            if ("intern" in saved && saved.intern)
              patch.internId = saved.intern.id;
            if ("reach" in saved) patch.reachId = saved.reach?.id ?? "";
            if ("kassa" in saved && saved.kassa) patch.kassaId = saved.kassa.id;
            if (
              patch.confirmId ||
              patch.internId ||
              patch.reachId ||
              patch.kassaId
            ) {
              writeSprechenDraftIds(
                deskDraftStorage(),
                mergeSprechenDraftIds(
                  readSprechenDraftIds(deskDraftStorage()),
                  patch,
                ),
              );
            }
          }
          void router.invalidate();
        } catch (err) {
          console.error("persistBoardEvent failed", err);
        }
      }
      if (!isCurrentCall()) return;
      setLines(withReply);
      if (forceDemo && origin === "speech") {
        setLastTrainingFact({
          source: trimmed,
          fact: "",
          lineId: userLine.id,
          speechOnly: true,
        });
      }
      if (training) {
        const fact = extractTrainFact(trimmed) || trimmed.slice(0, 240);
        if (live && !forceDemo && !anzeige) {
          try {
            const saved = await rememberPracticeFact({ data: { fact } });
            if (!isCurrentCall()) return;
            if (saved.ok) {
              setLastTrainingFact({
                source: trimmed,
                fact: saved.fact,
                id: saved.id,
                lineId: userLine.id,
              });
              setBoardNote(`Silvia merkt sich: ${saved.fact}`);
              toast.success("Hinweis gespeichert.");
              void router.invalidate();
            } else {
              toast.error(saved.error);
            }
          } catch {
            if (isCurrentCall()) toast.error("Hinweis nicht gespeichert.");
          }
        } else {
          const saved = await addTrainedFact(fact);
          if (!isCurrentCall()) return;
          if (!saved) {
            const cleanFact = fact.replace(/\s+/g, " ").trim().slice(0, 240);
            const demoFactsFull =
              cleanFact.length >= 8 &&
              trainedFacts.length >= MAX_TRAINED_FACTS &&
              !trainedFacts.some(
                (savedFact) =>
                  savedFact.toLowerCase() === cleanFact.toLowerCase(),
              );
            const saveError = demoFactsFull
              ? `${MAX_TRAINED_FACTS} Demo-Hinweise gespeichert. Beenden Sie das Gespräch und löschen Sie zuerst einen nicht mehr benötigten Hinweis.`
              : "Der Hinweis konnte nicht gespeichert werden. Bitte erneut senden.";
            setInput(fact);
            setLines([...next, { role: "assistant", content: saveError }]);
            setBoardNote(saveError);
            toast.error(saveError);
            return;
          }
          setLastTrainingFact({ source: trimmed, fact, lineId: userLine.id });
          setBoardNote(`Demo-Hinweis sichtbar: ${fact}`);
          toast.success("Demo-Hinweis sichtbar; nicht dauerhaft gespeichert.");
        }
      } else if (testMode) {
        setBoardLinks("tafel");
        setBoardNote(
          "Testanruf – es wurde nichts auf der Praxistafel gespeichert.",
        );
        toast.success("Test abgeschlossen. Es wurde nichts gespeichert.");
      } else if (!inbound && (forceDemo || !live)) {
        const result = writeToBoard({
          user: trimmed,
          reply,
          action: res.action,
          lines: withReply,
        });
        if (result.kind === "emergency") {
          setBoardLinks("tafel");
          setBoardNote(
            "Notfall in der Demo vermerkt. Bitte den Nachtdienst selbst anrufen.",
          );
          toast.error("Keine automatische Verbindung zum Nachtdienst.");
        } else if (result.akte) {
          setBoardLinks("tafel");
          setBoardNote(
            `${result.akte.name} in der Demo-Akte. Nachrichtenentwürfe für die Ordination vorbereitet.`,
          );
          toast.success(
            `${result.akte.name} in der Demo-Akte · nichts versendet.`,
          );
        } else if (result.kind === "book") {
          setBoardLinks("tafel");
          setBoardNote(
            "Demo-Termin und Protokoll vorgemerkt. Nichts versendet.",
          );
          toast.success(
            "Demo-Termin vorgemerkt; Nachrichten bleiben Entwürfe.",
          );
        } else {
          setBoardLinks("tafel");
          setBoardNote("Protokoll liegt auf der Praxistafel.");
        }
      } else if (bookingConflict) {
        setBoardLinks("tafel");
        setBoardNote("Terminstatus bitte auf der Tafel prüfen.");
      } else if (res.action.type === "emergency") {
        setBoardLinks("tafel");
        const hasNight = Boolean(desk?.nachtdienstPhone?.trim());
        if (live && !hasNight) {
          setBoardNote(
            "Notfall erkannt. Nachtdienst-Nummer fehlt – in den Einstellungen hinterlegen.",
          );
          toast.error(emergencyToast(false));
        } else {
          setBoardNote("Notfall liegt auf der Tafel.");
          toast.error(emergencyToast(true));
        }
      } else if (live && !forceDemo && !inbound) {
        const hint = livePersistStaffNote({
          internSkipped,
          actionType: res.action.type,
          pet: res.action.pet,
        });
        if (hint) {
          setBoardNote(hint.note);
          setBoardLinks(hint.links);
          if (hint.toastSuccess) toast.success(hint.toastSuccess);
        }
      } else if (res.action.type === "book") {
        setBoardLinks("tafel");
        const named = res.action.pet && res.action.pet !== "Patient";
        setBoardNote(
          named
            ? `Termin für ${res.action.pet} liegt auf der Tafel.`
            : "Termin liegt auf der Tafel.",
        );
        toast.success(
          named
            ? `Termin für ${res.action.pet} liegt.`
            : "Termin liegt auf der Tafel.",
        );
      } else {
        setBoardLinks("tafel");
        setBoardNote("Protokoll liegt auf der Praxistafel.");
      }
      void voice(reply);
    } catch {
      if (isCurrentCall()) {
        setLines((curr) => [
          ...curr,
          {
            role: "assistant",
            content:
              "Die Antwort konnte nicht bestätigt werden. Ob etwas gespeichert wurde, ist unklar. Bitte prüfen Sie die Tafel, bevor Sie es erneut versuchen.",
          },
        ]);
      }
    } finally {
      if (askTimeout !== null) window.clearTimeout(askTimeout);
      if (askRequestRef.current === askController) askRequestRef.current = null;
      if (isCurrentCall()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  async function correctTrainingFact(text: string) {
    const correction = text.trim();
    const previous = lastTrainingFact;
    if (
      !correction ||
      !previous ||
      !(training || forceDemo) ||
      busyRef.current ||
      speaking ||
      phaseRef.current !== "live"
    )
      return;
    if (!previous.lineId) {
      toast.error("Bitte senden Sie den Hinweis noch einmal.");
      return;
    }
    const speechOnly = Boolean(previous.speechOnly);
    const fact = extractTrainFact(correction) || correction.slice(0, 240);
    if (!speechOnly && fact.length < 8) {
      toast.error("Bitte geben Sie einen vollständigen Hinweis ein.");
      return;
    }
    if (speechOnly && correction.length > 40) {
      toast.error("Bitte korrigieren Sie mit einem kurzen Fachbegriff.");
      return;
    }

    const heard =
      heardForCheckRef.current ?? (speechOnly ? previous.source : null);
    const callGen = callGenRef.current;
    const signature = heard
      ? hoerCorrectionSignature({
          lineId: previous.lineId,
          callGeneration: callGen,
          heard,
          corrected: correction,
        })
      : "";
    const request = heard
      ? requestIdForSignature(correctionRequestRef.current, signature, () =>
          crypto.randomUUID(),
        )
      : null;
    const requestId = request?.requestId;
    if (request) correctionRequestRef.current = request;
    const isCurrentCall = () =>
      isCurrentCallSession({
        callGeneration: callGen,
        currentCallGeneration: callGenRef.current,
        phase: phaseRef.current,
      });
    busyRef.current = true;
    setBusy(true);
    try {
      let savedFact = fact;
      let savedId = previous.id;
      let demoTermSaved = false;
      let recognitionImproved = false;
      let recognitionReportFailed = false;
      let recognitionReportCapacity = false;
      const needsRecognitionReport = needsHoerCorrection(heard, correction);
      if (speechOnly && !demoSpeech && needsRecognitionReport) {
        const reported = await reportHoerCorrectionSafely(
          (data) =>
            reportHoerKorrektur({
              data: { ...data, demo: forceDemo || !live },
            }),
          { heard: heard ?? "", corrected: correction, requestId },
        );
        if (!isCurrentCall()) return;
        if (!reported.ok) {
          toast.error(
            reported.reason === "capacity"
              ? "Die Hörkorrekturen dieser Ordination haben die maximale Anzahl erreicht."
              : "Fachbegriff-Korrektur nicht gespeichert. Bitte erneut versuchen.",
          );
          return;
        }
        recognitionImproved = true;
      }
      if (speechOnly && demoSpeech) {
        // Die sichtbare Korrektur bleibt vollständig (inkl. Fragezeichen).
        // Für das Demo-Vokabular werden nur abschließende Satzzeichen entfernt.
        const demoTerm = correction.replace(/[?!.,;:]+$/u, "").trim();
        if (!normalizeDemoSpeechTerms([demoTerm]).length) {
          toast.error(
            "Bitte geben Sie einen Fachbegriff mit höchstens 40 Zeichen ein.",
          );
          return;
        }
        const previousDemoTerm = previous.source
          .replace(/[?!.,;:]+$/u, "")
          .trim();
        const terms = normalizeDemoSpeechTerms([
          ...readDemoSpeechTerms().filter((term) => term !== previousDemoTerm),
          demoTerm,
        ]);
        if (!writeDemoSpeechTerms(terms)) {
          toast.error(
            "Der Browser konnte den Fachbegriff nicht speichern. Bitte erlauben Sie die lokale Speicherung und versuchen Sie es erneut.",
          );
          return;
        }
        setDemoSpeechTerms(terms);
        demoTermSaved = true;
      }
      if (demoTermSaved) recognitionImproved = true;
      if (!speechOnly && live && !forceDemo && !anzeige) {
        if (!previous.id) {
          toast.error("Der gespeicherte Hinweis wurde nicht gefunden.");
          return;
        }
        const saved = await replacePracticeFact({
          data: { id: previous.id, fact, expectedFact: previous.fact },
        });
        if (!isCurrentCall()) return;
        if (!saved.ok) {
          toast.error(saved.error);
          return;
        }
        savedFact = saved.fact;
        savedId = saved.id;
        setBoardNote(`Silvia hat einen Hinweis korrigiert: ${saved.fact}`);
        void router.invalidate();
      } else if (!speechOnly) {
        const saved = await replaceTrainedFact(previous.fact, fact);
        if (!isCurrentCall()) return;
        if (!saved) {
          setBoardNote(
            "Demo-Hinweis konnte nicht im Browser gespeichert werden. Bitte erneut versuchen.",
          );
          toast.error(
            "Demo-Hinweis konnte nicht im Browser gespeichert werden. Bitte erneut versuchen.",
          );
          return;
        }
        setBoardNote(`Silvia hat den Demo-Hinweis korrigiert: ${fact}`);
      } else {
        setBoardNote(
          demoTermSaved
            ? forceDemo
              ? "Sprachkorrektur lokal gespeichert; bereits erfasste Termine bleiben unverändert."
              : "Fachbegriff im Browser gespeichert. Er hilft beim nächsten Demo-Sprachversuch."
            : "Sprachtraining: Fachbegriff korrigiert.",
        );
      }

      setLines((current) => {
        return current.map((line) =>
          line.id === previous.lineId ? { ...line, content: correction } : line,
        );
      });
      setLastTrainingFact({
        source: correction,
        fact: savedFact,
        id: savedId,
        lineId: previous.lineId,
        speechOnly,
      });
      setInput("");
      setHeard("");
      setCorrecting(false);
      heardForCheckRef.current = null;

      if (!speechOnly && !demoSpeech && needsRecognitionReport) {
        const reported = await reportHoerCorrectionSafely(
          (data) =>
            reportHoerKorrektur({
              data: { ...data, demo: forceDemo || !live },
            }),
          { heard: heard ?? "", corrected: correction, requestId },
        );
        if (!isCurrentCall()) return;
        recognitionImproved = reported.ok;
        recognitionReportFailed = !reported.ok;
        recognitionReportCapacity = reported.reason === "capacity";
      }
      if (speechOnly) {
        toast.success(
          recognitionImproved
            ? "Fachbegriff korrigiert. Das hilft der nächsten Erkennung."
            : "Fachbegriff korrigiert.",
        );
        return;
      }
      toast.success(
        recognitionReportFailed
          ? recognitionReportCapacity
            ? "Hinweis korrigiert. Die Hörkorrekturen dieser Ordination haben die maximale Anzahl erreicht."
            : "Hinweis korrigiert. Die Hörkorrektur konnte nicht gespeichert werden."
          : recognitionImproved
            ? "Hinweis korrigiert. Das kurze Wort hilft der nächsten Erkennung."
            : "Hinweis korrigiert.",
      );
    } catch {
      if (isCurrentCall())
        toast.error(
          "Korrektur konnte nicht gespeichert werden. Bitte erneut versuchen.",
        );
    } finally {
      if (isCurrentCall()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  function hangUp() {
    callGenRef.current += 1;
    listenAfterRef.current = false;
    stopListen();
    cancelVoice();
    busyRef.current = false;
    setBusy(false);
    setCorrecting(false);
    setPhase("ended");
  }

  function confirmLive(channel: DraftChannel) {
    if (anzeige) {
      toast.error(TAFEL_ANZEIGE_LINE);
      return;
    }
    if (!liveConfirm) return;
    const id = liveConfirm.id;
    void updateAppointmentStatus({ data: { id, status: "bestätigt" } })
      .then((res) => {
        if (!res.ok) {
          toast.error("Termin nicht bestätigt.");
          return;
        }
        toast.success(confirmDraftToast(channel));
        setLiveConfirm(null);
        writeSprechenDraftIds(
          deskDraftStorage(),
          mergeSprechenDraftIds(readSprechenDraftIds(deskDraftStorage()), {
            confirmId: "",
          }),
        );
        void router.invalidate();
      })
      .catch(() => toast.error("Termin nicht bestätigt."));
  }

  function takeOverKassa() {
    if (anzeige) {
      toast.error(TAFEL_ANZEIGE_LINE);
      return;
    }
    if (!liveKassa) return;
    const id = liveKassa.id;
    void updateCallStatus({ data: { id, status: "erledigt" } })
      .then((res) => {
        if (!res.ok) {
          toast.error("Status nicht gespeichert.");
          return;
        }
        toast.success("Übernommen.");
        setLiveKassa(null);
        writeSprechenDraftIds(
          deskDraftStorage(),
          mergeSprechenDraftIds(readSprechenDraftIds(deskDraftStorage()), {
            kassaId: "",
          }),
        );
        void router.invalidate();
      })
      .catch(() => toast.error("Status nicht gespeichert."));
  }

  function openInternDraft() {
    if (anzeige) {
      toast.error(TAFEL_ANZEIGE_LINE);
      return;
    }
    if (!liveIntern) return;
    const id = liveIntern.id;
    void markThreadRead({ data: { id } })
      .then((res) => {
        if (!res.ok) {
          toast.error(
            "error" in res && res.error
              ? res.error
              : "Protokoll nicht als gelesen markiert.",
          );
          return;
        }
        toast.success("Protokoll gelesen. Entwurf ist offen.");
        void router.invalidate();
      })
      .catch(() => toast.error("Protokoll nicht als gelesen markiert."));
  }

  async function startCall() {
    if (anzeige) {
      toast.error(TAFEL_ANZEIGE_LINE);
      return;
    }
    callGenRef.current += 1;
    const callGen = callGenRef.current;
    const startHref = window.location.href;
    if ((forceDemo || !live) && !(await hydrateTrainedFacts())) {
      if (callGen === callGenRef.current)
        toast.error(
          "Demo-Praxiswissen ist lokal noch nicht bereit. Bitte erneut versuchen.",
        );
      return;
    }
    if (
      !mountedRef.current ||
      callGen !== callGenRef.current ||
      window.location.href !== startHref
    )
      return;
    stopListen();
    cancelVoice();
    busyRef.current = false;
    setBusy(false);
    draftsGen.current += 1;
    writeSprechenDraftIds(
      deskDraftStorage(),
      draftsAfterNewCall(readSprechenDraftIds(deskDraftStorage())),
    );
    setLines([]);
    setSeconds(0);
    setLastTrainingFact(null);
    setCorrecting(false);
    heardForCheckRef.current = null;
    setLlmSource(null);
    setLiveConfirm(null);
    setLiveIntern(null);
    setLiveReach(null);
    setLiveKassa(null);
    setNightCase(false);
    greetedRef.current = false;
    listenAfterRef.current = true;
    setHeard("");
    setPhase("ringing");
    if (speaker) void playFile(audioRef, "/sounds/ring.mp3", 0.5);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      if (callGen === callGenRef.current) setMicOk(true);
    } catch {
      if (callGen === callGenRef.current) setMicOk(false);
    }
  }

  function toggleSpeaker() {
    setSpeaker((s) => {
      if (s) {
        invalidateVoiceGeneration();
        bargeRef.current = false;
        stopBargeWatch();
        stopPendingListenStream();
        stopAudio(audioRef);
        setSpeaking(false);
      }
      return !s;
    });
  }

  function toggleMic() {
    if (listening) {
      if (mediaRef.current && mediaRef.current.state === "recording") {
        mediaRef.current.stop();
        return;
      }
      stopListen();
      return;
    }
    listenAfterRef.current = true;
    startListen();
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  // Im echten Anruf gibt es nur einen Hauptknopf: Er beendet die laufende
  // Leitung. Nur nach einem konkreten Mikrofonfehler wird daraus sichtbar ein
  // neuer Sprechversuch. Das Training behält seinen eigenen Flow.
  const callCanHangUp = !training && phase === "live" && !sttNote;

  const deskChrome = layout === "embed";
  const trainingEnd =
    training && (phase === "ringing" || phase === "live") ? (
      <button
        type="button"
        id="sprechen-training-beenden"
        className="mx-auto mt-2 text-xs opacity-70 underline underline-offset-2 hover:opacity-100"
        onClick={hangUp}
      >
        Schulung beenden
      </button>
    ) : null;
  // AP 58: letzte User-Blase trägt im Training den "Korrigieren"-Button.
  const phone = (
    <PhoneShell
      className={cn(
        "mx-auto min-h-[32rem]",
        deskChrome ? "min-h-0" : undefined,
      )}
      tone={deskChrome ? "desk" : "night"}
      line={deskLineNumber(desk)}
      footer={
        phase === "live" ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ((training || forceDemo) && correcting
                ? correctTrainingFact(input)
                : send(input));
            }}
          >
            {(training || forceDemo) && correcting ? (
              <p
                id="hoer-korrigieren-note"
                className="text-xs leading-snug opacity-80"
              >
                {trainingKind === "sprache"
                  ? "Der erkannte Fachbegriff wird ersetzt."
                  : forceDemo && !training
                    ? "Nur der erkannte Text wird korrigiert. Termine bleiben unverändert."
                    : "Der Hinweis wird ersetzt. Ein kurzer korrigierter Begriff hilft zusätzlich der Spracherkennung."}
              </p>
            ) : null}
            <input
              ref={trainingInputRef}
              value={listening ? heard || input : input}
              onChange={(e) => setInput(e.target.value)}
              readOnly={training && listening}
              aria-describedby={
                correcting && (training || forceDemo)
                  ? "hoer-korrigieren-note"
                  : undefined
              }
              placeholder={
                training
                  ? nextTrainingPlaceholder(listening, micOk)
                  : listening
                    ? "Ich höre …"
                    : micOk
                      ? "Fragen Sie etwas – oder das Mikrofon"
                      : "Mikrofon gesperrt – hier tippen"
              }
              className={cn(
                "h-11 rounded-[3px] border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ok",
                deskChrome
                  ? "border-border bg-background text-foreground placeholder:text-muted-foreground"
                  : "border-night-foreground/15 bg-night-foreground/8 text-night-foreground placeholder:text-night-foreground/40",
              )}
            />
            {sttNote ? (
              <p
                id="sprechen-stt-fail"
                className="text-xs leading-snug text-flag"
              >
                {sttNote}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                className={cn(
                  "flex-1",
                  callCanHangUp
                    ? "bg-flag text-primary-foreground hover:bg-flag/90"
                    : listening
                      ? "bg-flag text-primary-foreground hover:bg-flag/90"
                      : "bg-ok text-primary-foreground hover:bg-ok/90",
                )}
                // Im echten Gespräch muss Auflegen immer erreichbar bleiben –
                // auch wenn das Nachrichtenlimit bereits verbraucht ist.
                disabled={
                  training
                    ? busy || remaining <= 0
                    : !callCanHangUp && remaining <= 0
                }
                onClick={callCanHangUp ? hangUp : toggleMic}
              >
                <Mic />
                {callCanHangUp
                  ? "Auflegen"
                  : training && listening
                    ? "Fertig"
                    : "Sprechen"}
              </Button>
              {training &&
              (listening ||
                (trainingKind === "sprache" && !correcting)) ? null : (
                <Button
                  type="submit"
                  variant="outline"
                  className={
                    deskChrome
                      ? "rounded-[3px] border-border bg-transparent"
                      : "border-night-foreground/20 bg-transparent text-night-foreground hover:bg-night-foreground/10"
                  }
                  disabled={busy || remaining <= 0 || !input.trim()}
                >
                  {(training || forceDemo) && correcting
                    ? "Korrigieren"
                    : "Senden"}
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                variant="outline"
                className={
                  deskChrome
                    ? "rounded-[3px] border-border bg-transparent"
                    : "border-night-foreground/20 bg-transparent text-night-foreground hover:bg-night-foreground/10"
                }
                onClick={toggleSpeaker}
                aria-label={speaker ? "Stimme aus" : "Stimme an"}
              >
                {speaker ? <Volume2 /> : <VolumeX />}
              </Button>
            </div>
          </form>
        ) : null
      }
    >
      {phase === "idle" || phase === "ended" ? (
        <div className="flex h-full min-h-80 flex-col items-center justify-center gap-5 text-center">
          <SilviaAvatar size="lg" pulse avatarId={liveAvatar} />
          <div>
            <p className="font-display text-2xl">
              {desk?.shortName ?? PRACTICE.shortName}
            </p>
            <p className="text-sm opacity-70">{deskCityLabel(desk)}</p>
          </div>
          {phase === "ended" ? (
            <p className="text-sm opacity-70">
              Gespräch beendet · {mm}:{ss}
            </p>
          ) : null}
          <Button
            id="sprechen-anrufen"
            size="lg"
            className={
              deskChrome
                ? "h-12 w-full rounded-[3px] bg-primary px-6 text-[15px] font-semibold text-primary-foreground hover:bg-[#173729]"
                : "bg-ok text-primary-foreground hover:bg-ok/90"
            }
            disabled={anzeigeControl(anzeige).disabled}
            title={anzeige ? TAFEL_ANZEIGE_LINE : undefined}
            onClick={() => void startCall()}
          >
            <Phone />
            {phase === "ended"
              ? training
                ? "Erneut schulen"
                : testMode
                  ? "Test erneut starten"
                  : "Erneut anrufen"
              : training
                ? "Schulung starten"
                : testMode
                  ? "Testanruf starten"
                  : "Anrufen"}
          </Button>
          {anzeige ? (
            <p id="sprechen-anzeige" className="max-w-xs text-sm opacity-80">
              {TAFEL_ANZEIGE_LINE}
            </p>
          ) : (
            <p className="text-xs opacity-60">
              {training
                ? trainingKind === "sprache"
                  ? "Sprechen Sie einen Fachbegriff; die Erkennung lässt sich danach korrigieren."
                  : live
                    ? "Schulen Sie Silvia: Wissen, Begrüßung und Ton Ihrer Ordination."
                    : "Die Demo zeigt die Korrektur; dauerhafte Fachbegriffe speichert nur eine angemeldete Ordination."
                : testMode
                  ? "Testet mit Ihren Praxisregeln. Es wird nichts gespeichert."
                  : "Mikrofon an. Sie fragen, Silvia antwortet."}
            </p>
          )}
        </div>
      ) : null}

      {phase === "ringing" ? (
        <div className="flex h-full min-h-80 flex-col items-center justify-center gap-4 text-center">
          <span className="relative flex size-20 items-center justify-center">
            <span className="alma-ring-halo absolute inset-0 rounded-full bg-ok/30" />
            <SilviaAvatar size="lg" avatarId={liveAvatar} />
          </span>
          <p className="font-display text-2xl">
            {training ? "Schulung …" : testMode ? "Testanruf …" : "Klingelt …"}
          </p>
          <p className="text-sm opacity-70">
            {training
              ? "Silvia hört zu, um zu lernen"
              : testMode
                ? "Es wird nichts gespeichert"
                : "Silvia geht ans Telefon"}
          </p>
        </div>
      ) : null}
      {trainingEnd}

      {phase === "live" ? (
        <div className="flex h-full flex-col">
          <div
            className={cn(
              "mb-3 flex items-center gap-3 px-3 py-2",
              deskChrome
                ? "rounded-[3px] border border-border bg-[#F4F0E6]"
                : "rounded-lg bg-night-foreground/8",
            )}
          >
            <SilviaAvatar size="sm" avatarId={liveAvatar} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {listening
                  ? "Silvia hört zu"
                  : speaking
                    ? "Silvia spricht"
                    : busy
                      ? "Silvia notiert"
                      : "Verbunden"}
              </p>
              <p className="truncate text-xs opacity-70">
                {conversationStatusText({
                  training,
                  testMode,
                  forceDemo,
                  live,
                  inbound,
                })}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {llmSource ? (
                <span
                  id="sprechen-llm-source"
                  data-source={llmSource.source}
                  data-provider={llmSource.provider}
                  className={cn(
                    "max-w-[8.5rem] text-right text-[11px] leading-tight opacity-80",
                    llmSource.fallback && "text-flag",
                  )}
                >
                  {llmSource.label}
                </span>
              ) : null}
              {busy || speaking || listening ? (
                <Waveform className="text-ok" />
              ) : null}
              <span className="text-xs tabular-nums opacity-70">
                {mm}:{ss}
              </span>
            </div>
          </div>
          <div className="flex min-h-52 flex-col gap-2 overflow-y-auto">
            {lines.map((l, i) => (
              <div
                key={l.id ?? i}
                data-line-role={l.role}
                className={cn(
                  "alma-rise max-w-[92%] rounded-lg px-3 py-2 text-sm leading-snug",
                  l.role === "assistant"
                    ? deskChrome
                      ? "rounded-[3px] border border-border bg-[#F4F0E6]"
                      : "bg-ok/20"
                    : deskChrome
                      ? "ml-auto text-[#4A453D]"
                      : "ml-auto bg-night-foreground/10",
                )}
              >
                {l.content}
                {l.role === "assistant" && l.sourceLabel ? (
                  <p
                    className={cn(
                      "mt-1 text-[11px] opacity-60",
                      l.sourceFallback && "text-flag opacity-90",
                    )}
                  >
                    {l.sourceLabel}
                  </p>
                ) : null}
                {/* AP 58: Korrektur nur auf Wunsch — in Sprachtraining und
                    forceDemo an der letzten User-Blase, nie während Silvia zuhört/antwortet. */}
                {(training || forceDemo) &&
                l.role === "user" &&
                l.id === lastTrainingFact?.lineId &&
                !busy &&
                !speaking ? (
                  <button
                    id="hoer-korrigieren"
                    type="button"
                    className="mt-1 block text-[11px] underline opacity-70 hover:opacity-100"
                    onClick={() => {
                      stopListen();
                      setInput(l.content);
                      setCorrecting(true);
                      trainingInputRef.current?.focus();
                    }}
                  >
                    Korrigieren
                  </button>
                ) : null}
              </div>
            ))}
            {listening && heard ? (
              <div
                className={cn(
                  "alma-rise ml-auto max-w-[92%] px-3 py-2 text-sm leading-snug opacity-70",
                  deskChrome
                    ? "text-[#4A453D]"
                    : "rounded-lg bg-night-foreground/10",
                )}
              >
                {heard}
              </div>
            ) : null}
            {speaking ? (
              <p className="text-xs opacity-60">Silvia spricht …</p>
            ) : null}
            {busy ? (
              <p className="text-xs opacity-60">Silvia notiert …</p>
            ) : null}
            {listening && !heard ? (
              <p className="text-xs opacity-60">Sprechen Sie …</p>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(training
              ? trainPromptsFor(live, trainingKind)
              : live
                ? [
                    "Mein Hund ist lahm vorne links.",
                    "Welche Ordinationszeiten haben Sie?",
                    "Atemnot, Zunge bläulich.",
                    "Rufen Sie mich zurück, bitte.",
                    "Ich brauche einen Impftermin.",
                  ]
                : SUGGESTED_PROMPTS
            )
              .slice(0, 5)
              .map((p) =>
                training && trainingKind === "sprache" ? (
                  <span
                    key={p}
                    className={cn(
                      "px-2.5 py-1 text-left text-xs",
                      deskChrome
                        ? "rounded-[3px] border border-border text-[#4A453D]"
                        : "rounded-full border border-night-foreground/15 opacity-80",
                    )}
                    role="note"
                  >
                    Beispiel zum Sprechen: {p}
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={cn(
                      "px-2.5 py-1 text-left text-xs",
                      deskChrome
                        ? "rounded-[3px] border border-border text-[#4A453D] hover:bg-[#F4F0E6]"
                        : "rounded-full border border-night-foreground/15 opacity-80 hover:bg-night-foreground/8",
                    )}
                    onClick={() => void send(p)}
                  >
                    {p}
                  </button>
                ),
              )}
          </div>
        </div>
      ) : null}
    </PhoneShell>
  );

  function selectTrainingKind(kind: TrainingKind) {
    if (
      kind === trainingKind ||
      phase === "live" ||
      phase === "ringing" ||
      anzeige
    )
      return;
    stopListen();
    cancelVoice();
    setTrainingKind(kind);
    setInput("");
    setHeard("");
    setLines([]);
    setBoardNote(null);
    setSttNote(null);
    setCorrecting(false);
    setLastTrainingFact(null);
    heardForCheckRef.current = null;
  }

  const modeSwitch = allowTrain ? (
    deskChrome ? (
      <div className="flex border-b border-border bg-[#F4F0E6]">
        <button
          type="button"
          id="sprechen-mode-anrufen"
          className="relative min-h-12 flex-1 text-sm font-semibold text-foreground hover:bg-[#EDE7D9] disabled:opacity-50"
          disabled={
            phase === "live" ||
            phase === "ringing" ||
            anzeigeControl(anzeige).disabled
          }
          title={anzeige ? TAFEL_ANZEIGE_LINE : undefined}
          onClick={() => setTrainMode(false)}
        >
          Anrufen
          {!trainMode ? (
            <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
          ) : null}
        </button>
        <button
          type="button"
          id="sprechen-mode-trainieren"
          className="relative min-h-12 flex-1 border-l border-border text-sm font-semibold text-foreground hover:bg-[#EDE7D9] disabled:opacity-50"
          disabled={
            phase === "live" ||
            phase === "ringing" ||
            anzeigeControl(anzeige).disabled
          }
          title={anzeige ? TAFEL_ANZEIGE_LINE : undefined}
          onClick={() => {
            if (anzeige) {
              toast.error(TAFEL_ANZEIGE_LINE);
              return;
            }
            setTrainMode(true);
          }}
        >
          Trainieren
          {trainMode ? (
            <span className="absolute inset-x-0 -bottom-px h-0.5 bg-warn" />
          ) : null}
        </button>
      </div>
    ) : (
      <div className="flex rounded-full border border-primary/20 bg-card p-1 text-sm">
        <button
          type="button"
          id="sprechen-mode-anrufen"
          className={cn(
            "rounded-full px-3 py-1.5",
            !trainMode
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          disabled={
            phase === "live" ||
            phase === "ringing" ||
            anzeigeControl(anzeige).disabled
          }
          title={anzeige ? TAFEL_ANZEIGE_LINE : undefined}
          onClick={() => setTrainMode(false)}
        >
          Anrufen
        </button>
        <button
          type="button"
          id="sprechen-mode-trainieren"
          className={cn(
            "rounded-full px-3 py-1.5",
            trainMode
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          disabled={
            phase === "live" ||
            phase === "ringing" ||
            anzeigeControl(anzeige).disabled
          }
          title={anzeige ? TAFEL_ANZEIGE_LINE : undefined}
          onClick={() => {
            if (anzeige) {
              toast.error(TAFEL_ANZEIGE_LINE);
              return;
            }
            setTrainMode(true);
          }}
        >
          Trainieren
        </button>
      </div>
    )
  ) : null;

  const trainingKindSwitch =
    allowTrain && trainMode ? (
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Trainingsart">
        <button
          type="button"
          id="sprechen-training-wissen"
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm",
            trainingKind === "wissen"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
          disabled={phase === "live" || phase === "ringing" || anzeige}
          aria-pressed={trainingKind === "wissen"}
          onClick={() => selectTrainingKind("wissen")}
        >
          Praxiswissen
        </button>
        <button
          type="button"
          id="sprechen-training-sprache"
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm",
            trainingKind === "sprache"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
          disabled={phase === "live" || phase === "ringing" || anzeige}
          aria-pressed={trainingKind === "sprache"}
          onClick={() => selectTrainingKind("sprache")}
        >
          Sprache erkennen
        </button>
      </div>
    ) : null;

  const learned =
    training &&
    trainingKind === "wissen" &&
    (forceDemo || !live) &&
    trainedFacts.length ? (
      <section
        className="max-w-[22rem]"
        aria-label="Gespeicherte Demo-Praxisregeln"
      >
        <p className="text-xs text-muted-foreground">
          Gespeicherte Demo-Praxisregeln · nur in diesem Browser
        </p>
        <ul
          aria-label="Gelernte Praxisregeln"
          className="mt-1 max-h-48 space-y-1 overflow-y-auto text-sm text-muted-foreground"
        >
          {trainedFacts.map((f) => (
            <li key={f} className="flex items-start justify-between gap-2">
              <span>· {f}</span>
              <button
                type="button"
                className="shrink-0 underline"
                aria-label={`${f} löschen`}
                disabled={phase === "live" || phase === "ringing"}
                onClick={async () => {
                  if (!(await removeTrainedFact(f))) {
                    toast.error("Demo-Hinweis konnte nicht gelöscht werden.");
                    return;
                  }
                  if (lastTrainingFact?.fact.toLowerCase() === f.toLowerCase())
                    setLastTrainingFact(null);
                  setBoardNote(`Demo-Hinweis gelöscht: ${f}`);
                  toast.success("Demo-Hinweis gelöscht.");
                }}
              >
                Löschen
              </button>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  const demoVocabulary =
    training && trainingKind === "sprache" && demoSpeech ? (
      <section
        className="mt-4 px-4 pb-3 text-sm"
        aria-label="Demo-Fachbegriffe"
      >
        <p>Demo-Fachbegriffe: {demoSpeechTerms.length}/20</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nur Testbegriffe verwenden. Gespeichert in diesem Browser, bei der
          Spracherkennung an den Sprachdienst übergeben. Keine Garantie für
          fehlerfreie Erkennung.
        </p>
        {demoSpeechTerms.length ? (
          <ul className="mt-2 space-y-1">
            {demoSpeechTerms.map((term) => (
              <li
                key={term}
                className="flex items-center justify-between gap-2"
              >
                <span>{term}</span>
                <button
                  type="button"
                  className="underline"
                  aria-label={`${term} löschen`}
                  disabled={phase === "live" || phase === "ringing"}
                  onClick={() => {
                    const next = readDemoSpeechTerms().filter(
                      (value) => value !== term,
                    );
                    if (writeDemoSpeechTerms(next)) setDemoSpeechTerms(next);
                    else
                      toast.error("Fachbegriff konnte nicht gelöscht werden.");
                  }}
                >
                  Löschen
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    ) : null;

  if (layout === "embed") {
    return (
      <div className="w-full max-w-[440px] overflow-hidden rounded-[6px] bg-card shadow-[0_1px_0_#DCD5C6,0_24px_48px_-28px_rgba(28,25,21,0.28)] ring-1 ring-border">
        <div className="flex items-center gap-2.5 bg-primary px-[18px] py-3.5 text-primary-foreground">
          <span className="size-2 shrink-0 rounded-full bg-[#8FD3AE] alma-pulse" />
          <span className="text-[13px] font-semibold">
            Tierordination Huber
          </span>
          <span className="ms-auto text-xs text-[#A9C4B5]">
            Josefstadt, Wien
          </span>
        </div>
        {modeSwitch}
        {trainingKindSwitch}
        {demoVocabulary}
        {phone}
        {learned ? <div className="px-[18px] pb-3">{learned}</div> : null}
        <p className="border-t border-border bg-[#F4F0E6] px-[18px] py-2.5 text-[11.5px] text-muted-foreground">
          Immer die Huber-Demo. Nie Ihre eigene Tafel.
        </p>
      </div>
    );
  }

  return (
    <>
      <main className="mx-auto grid max-w-5xl items-start gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_22rem]">
        <div className="order-2 lg:order-1">
          <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
            {training
              ? trainingKind === "sprache"
                ? "Sprachtraining"
                : "Praxiswissen"
              : testMode
                ? "Testanruf"
                : "Live-Leitung"}
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold">
            {training
              ? trainingKind === "sprache"
                ? "Sprechen Sie den Fachbegriff. Üben Sie die Erkennung."
                : "Sagen Sie es Silvia. Sie merkt es sich."
              : testMode
                ? "Testen Sie Silvia ohne echte Einträge."
                : "Sie fragen. Silvia antwortet."}
          </h1>
          <p className="mt-4 max-w-md text-muted-foreground">
            {training
              ? trainingKind === "sprache"
                ? live && !forceDemo
                  ? "Wenn Silvia einen Fachbegriff falsch aufschreibt, korrigieren Sie ihn. Gespeicherte Korrekturen helfen der nächsten Erkennung Ihrer Ordination."
                  : "Korrigierte Fachbegriffe bleiben in diesem Browser und helfen beim nächsten Demo-Sprachversuch. Sie können sie unten wieder löschen."
                : live
                  ? "Hinweise landen in den Einstellungen und gelten beim nächsten Anruf der Klientel."
                  : "In der Demo merkt sie sich das im Browser. Danach anrufen und nachfragen."
              : testMode
                ? "Sie testen mit Ihren hinterlegten Praxisregeln. Dieser Anruf legt keine Akte, keinen Termin und kein Protokoll an."
                : anzeige
                  ? TAFEL_ANZEIGE_LINE
                  : live
                    ? inbound
                      ? `Öffentliche Leitung der ${desk?.name}. Sie müssen sich nicht anmelden.`
                      : `Leitung der ${desk?.name}. Silvia spricht mit Ihren Zeiten und Ihrem Nachtdienst.`
                    : "Die Stimme ist das Produkt: Tempo der Tierarzthelferin, Pause nach dem Grüß Gott. Dann die Akte – fragen Sie nach dem Kater Fritz."}
          </p>
          {modeSwitch ? (
            <div className="mt-6">
              {modeSwitch}
              {trainingKindSwitch}
              {demoVocabulary}
            </div>
          ) : null}
          {live ? (
            <>
              <VoicePicker
                className="mt-8"
                previewText={voicePreviewText(desk?.shortName ?? "")}
              />
            </>
          ) : (
            <>
              <SilviaVarianten compact />
              <p className="mt-3 text-xs text-muted-foreground">
                Die Hörprobe ist vorbereitet; sie ist keine interaktive
                GPT-Live-Verbindung.
              </p>
            </>
          )}
          <dl className="mt-8 space-y-3 text-sm">
            <div>
              <dt className="text-xs tracking-wider text-muted-foreground uppercase">
                Ordination
              </dt>
              <dd id="sprechen-adresse" className="font-medium">
                {desk?.name ?? PRACTICE.name}
                <br />
                {desk
                  ? [desk.street, desk.zip, desk.city]
                      .filter(Boolean)
                      .join(", ") || desk.city
                  : `${PRACTICE.street}, ${PRACTICE.zip} ${PRACTICE.city} · 8. Bezirk`}
              </dd>
            </div>
            <div>
              <dt className="text-xs tracking-wider text-muted-foreground uppercase">
                Leitung
              </dt>
              <dd id="sprechen-leitung-nr" className="tabular-nums">
                {desk ? desk.phone || "noch nicht hinterlegt" : PRACTICE.phone}
              </dd>
            </div>
            <div>
              <dt className="text-xs tracking-wider text-muted-foreground uppercase">
                WhatsApp
              </dt>
              <dd id="sprechen-whatsapp-nr" className="tabular-nums">
                {live
                  ? deskWhatsappNumber(desk) || "nicht hinterlegt"
                  : PRACTICE.whatsapp}
              </dd>
            </div>
          </dl>
          {emergency ? (
            <div
              id="sprechen-nachtdienst"
              className="mt-6 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm"
            >
              <p className="font-medium text-destructive">
                Silvia hat einen Notfall erkannt.
              </p>
              <p className="text-muted-foreground">
                {desk
                  ? [
                      spokenNachtdienstDest(
                        desk.nachtdienstName,
                        desk.nachtdienstPhone,
                      ),
                      desk.nachtdienstPhone,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Nummer nicht hinterlegt"
                  : `${PRACTICE.nachtdienst.name} · ${PRACTICE.nachtdienst.phone}`}
              </p>
              <p className="mt-1 text-muted-foreground">
                {live && !desk?.nachtdienstPhone
                  ? nachtdienstReachCopy("", anzeige)
                  : nachtdienstReachCopy(
                      desk?.nachtdienstPhone ||
                        (!live ? PRACTICE.nachtdienst.phone : ""),
                      anzeige,
                    )}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <NachtdienstReach
                  phone={
                    desk?.nachtdienstPhone ||
                    (!live ? PRACTICE.nachtdienst.phone : "")
                  }
                  body={nachtdienstDraft({
                    practiceName: desk?.name ?? PRACTICE.name,
                    pet: liveConfirm?.pet,
                  })}
                  size="default"
                  idPrefix="sprechen-nacht"
                />
                {live && !inbound && !anzeige && !desk?.nachtdienstPhone ? (
                  <Button variant="outline" size="default" asChild>
                    <Link
                      id="sprechen-nacht-settings"
                      to="/app/einstellungen"
                      hash="nachtdienst"
                    >
                      Nachtdienst-Nummer hinterlegen
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {liveKassa && !inbound && !training ? (
            <div
              id="sprechen-kassa-uebernommen"
              className="mt-4 flex flex-col gap-2 rounded-xl border border-primary/30 bg-card p-4"
            >
              <p className="font-medium">
                An der Leitung ·{" "}
                {liveKassa.owner.replace(/^Klientel\s+/i, "") || liveKassa.pet}
              </p>
              <p className="text-sm text-muted-foreground">
                Klientel bleibt in der Leitung. Übernommen markiert den Zettel —
                Silvia legt nicht auf. Die Halterin wird nicht zurückgerufen.
              </p>
              {liveKassa.concern ? (
                <p className="text-sm">{liveKassa.concern}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  id="sprechen-kassa-uebernommen-btn"
                  disabled={anzeigeControl(anzeige).disabled}
                  title={anzeige ? TAFEL_ANZEIGE_LINE : undefined}
                  onClick={takeOverKassa}
                >
                  Übernommen
                </Button>
              </div>
            </div>
          ) : null}
          {liveReach && !inbound && !training ? (
            <div
              id="sprechen-halterin-rueckruf"
              className="mt-4 flex flex-col gap-2 rounded-xl border border-primary/30 bg-card p-4"
            >
              <p className="font-medium">
                Rückruf ·{" "}
                {liveReach.owner.replace(/^Klientel\s+/i, "") || liveReach.pet}
              </p>
              <p className="text-sm text-muted-foreground">
                Anrufen, SMS, WhatsApp und E-Mail gehen an die Halterin. Silvia
                sendet nicht selbst.
              </p>
              <div className="flex flex-wrap gap-2">
                <HalterinReach
                  openId="sprechen-rueckruf-reach"
                  ownerPhone={liveReach.phone}
                  ownerEmail={liveReach.email}
                  mailSubject={liveReach.mailSubject}
                  body={liveReach.body}
                  size="default"
                />
                <AkteHandyLink
                  pet={liveReach.pet}
                  size="default"
                  owner={liveReach.owner}
                  ownerPhone={liveReach.phone}
                  ownerEmail={liveReach.email}
                  anzeige={anzeige}
                />
              </div>
            </div>
          ) : null}
          {liveConfirm && !inbound && !training ? (
            <div
              id="sprechen-halterin-confirm"
              className="mt-4 flex flex-col gap-2 rounded-xl border border-primary/30 bg-card p-4"
            >
              <p className="font-medium">
                Termin ·{" "}
                {slotSpokenName(liveConfirm.pet, liveConfirm.owner) || "gelegt"}
              </p>
              <p className="text-sm text-muted-foreground">
                {liveConfirm.owner}
                {confirmReachHint(liveConfirm)}
              </p>
              <div className="flex flex-wrap gap-2">
                {liveConfirm.href ? (
                  <DeskDraftButton
                    id="sprechen-wa-bestaetigung"
                    href={liveConfirm.href}
                    size="default"
                    disabled={anzeigeControl(anzeige).disabled}
                    title={anzeige ? TAFEL_ANZEIGE_LINE : undefined}
                    onAct={() => confirmLive("whatsapp")}
                  >
                    WhatsApp-Bestätigung an die Halterin
                  </DeskDraftButton>
                ) : null}
                {liveConfirm.smsHref ? (
                  <DeskDraftButton
                    id="sprechen-sms-bestaetigung"
                    href={liveConfirm.smsHref}
                    size="default"
                    variant="outline"
                    newTab={false}
                    disabled={anzeigeControl(anzeige).disabled}
                    title={anzeige ? TAFEL_ANZEIGE_LINE : undefined}
                    onAct={() => confirmLive("sms")}
                  >
                    SMS-Bestätigung an die Halterin
                  </DeskDraftButton>
                ) : null}
                {liveConfirm.mailHref ? (
                  <DeskDraftButton
                    id="sprechen-mail-bestaetigung"
                    href={liveConfirm.mailHref}
                    size="default"
                    variant="outline"
                    newTab={false}
                    disabled={anzeigeControl(anzeige).disabled}
                    title={anzeige ? TAFEL_ANZEIGE_LINE : undefined}
                    onAct={() => confirmLive("mail")}
                  >
                    E-Mail-Bestätigung an die Halterin
                  </DeskDraftButton>
                ) : null}
                {needsSilentConfirm(liveConfirm) ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={anzeigeControl(anzeige).disabled}
                    title={anzeige ? TAFEL_ANZEIGE_LINE : undefined}
                    onClick={() => confirmLive("")}
                  >
                    Trotzdem als bestätigt markieren
                  </Button>
                ) : null}
                <AkteHandyLink
                  pet={liveConfirm.pet}
                  size="default"
                  owner={liveConfirm.owner}
                  ownerPhone={liveConfirm.phone}
                  ownerEmail={liveConfirm.email}
                  anzeige={anzeige}
                />
              </div>
            </div>
          ) : null}
          {liveIntern && !inbound && !training ? (
            <div
              id="sprechen-frau-doktor"
              className="mt-4 flex flex-col gap-2 rounded-xl border border-primary/30 bg-card p-4"
            >
              <p className="font-medium">
                An die Frau Doktor · {liveIntern.pet}
              </p>
              <p className="text-sm text-muted-foreground">
                {liveIntern.owner}. Anrufen, WhatsApp, SMS und E-Mail gehen an
                die Nummer und Adresse aus den Einstellungen, nicht an die
                Halterin. Silvia sendet nicht selbst.
              </p>
              <div className="flex flex-wrap gap-2">
                {liveIntern.telHref ? (
                  <DeskDraftButton
                    id="sprechen-intern-tel"
                    href={liveIntern.telHref}
                    size="default"
                    newTab={false}
                    disabled={anzeigeControl(anzeige).disabled}
                    title={anzeige ? TAFEL_ANZEIGE_LINE : undefined}
                    onAct={() => openInternDraft()}
                  >
                    Frau Doktor anrufen
                  </DeskDraftButton>
                ) : null}
                {liveIntern.href ? (
                  <DeskDraftButton
                    id="sprechen-intern-wa"
                    href={liveIntern.href}
                    size="default"
                    disabled={anzeigeControl(anzeige).disabled}
                    title={anzeige ? TAFEL_ANZEIGE_LINE : undefined}
                    onAct={() => openInternDraft()}
                  >
                    WhatsApp an {liveIntern.owner}
                  </DeskDraftButton>
                ) : null}
                {liveIntern.smsHref ? (
                  <DeskDraftButton
                    id="sprechen-intern-sms"
                    href={liveIntern.smsHref}
                    size="default"
                    variant="outline"
                    newTab={false}
                    disabled={anzeigeControl(anzeige).disabled}
                    title={anzeige ? TAFEL_ANZEIGE_LINE : undefined}
                    onAct={() => openInternDraft()}
                  >
                    SMS öffnen
                  </DeskDraftButton>
                ) : null}
                {liveIntern.mailHref ? (
                  <DeskDraftButton
                    id="sprechen-intern-mail"
                    href={liveIntern.mailHref}
                    size="default"
                    variant="outline"
                    newTab={false}
                    disabled={anzeigeControl(anzeige).disabled}
                    title={anzeige ? TAFEL_ANZEIGE_LINE : undefined}
                    onAct={() => openInternDraft()}
                  >
                    E-Mail öffnen
                  </DeskDraftButton>
                ) : null}
                <Button variant="outline" size="default" asChild>
                  <Link to="/app/nachrichten" search={{ t: liveIntern.id }}>
                    Protokoll
                  </Link>
                </Button>
                {(() => {
                  const internSettings = internSettingsTarget(liveIntern);
                  if (!live || inbound || !internSettings) return null;
                  return (
                    <Button variant="outline" size="default" asChild>
                      <Link
                        id="sprechen-intern-settings"
                        to="/app/einstellungen"
                        hash={internSettings.hash}
                      >
                        {internSettings.label}
                      </Link>
                    </Button>
                  );
                })()}
              </div>
            </div>
          ) : null}
          {boardNote ? (
            inbound ? (
              <p className="mt-4 text-sm">{boardNote}</p>
            ) : testMode ? (
              <p id="sprechen-board-note" className="mt-4 text-sm">
                {boardNote}
              </p>
            ) : training ? (
              <p className="mt-4 text-sm">
                {boardNote}{" "}
                {live ? (
                  <Link
                    to="/app/einstellungen"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Einstellungen
                  </Link>
                ) : (
                  <span className="text-muted-foreground">
                    Danach Anrufen und nachfragen.
                  </span>
                )}
              </p>
            ) : (
              <p id="sprechen-board-note" className="mt-4 text-sm">
                {boardNote}{" "}
                <Link
                  to={live ? "/app/akte" : "/demo/akte"}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Akte
                </Link>
                {" · "}
                {boardLinks === "anrufe" ? (
                  <Link
                    id="sprechen-board-anrufe"
                    to="/app/anrufe"
                    search={{ c: undefined }}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Anrufe
                  </Link>
                ) : (
                  <Link
                    to={live ? "/app/nachrichten" : "/demo/nachrichten"}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Protokoll
                  </Link>
                )}
                {" · "}
                <Link
                  to={live ? "/app" : "/demo"}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Praxistafel
                </Link>
              </p>
            )
          ) : null}
        </div>

        <div className="order-1 lg:order-2">{phone}</div>
      </main>
      {!live && !inbound && !anzeige ? <SilviaLiveDemo /> : null}
    </>
  );
}
