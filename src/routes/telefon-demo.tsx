import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";

export const Route = createFileRoute("/telefon-demo")({ component: TelefonDemoPage });

type Message = { role: "user" | "bot"; text: string };
type Protocol = { location: string; category: string; priority: string; occurredAt: string; summary: string; callback: string };

function TelefonDemoPage() {
  const [messages, setMessages] = useState<Message[]>([{ role: "bot", text: "Grüß Gott. Ich bin der Kundenservice-Bot. Was ist in der Parkgarage passiert?" }]);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [voiceReady, setVoiceReady] = useState<boolean | null>(null);
  const [liveState, setLiveState] = useState<"idle" | "connecting" | "live">("idle");
  const [protocol, setProtocol] = useState<Protocol>({ location: "", category: "", priority: "normal", occurredAt: "", summary: "", callback: "" });
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const liveConnection = useRef<RTCPeerConnection | null>(null);
  const liveStream = useRef<MediaStream | null>(null);
  const liveAudio = useRef<HTMLAudioElement | null>(null);
  const protocolRef = useRef(protocol);
  const liveTranscriptIds = useRef(new Set<string>());
  const liveProtocolQueue = useRef(Promise.resolve());

  function applyProtocol(next: Protocol) {
    protocolRef.current = next;
    setProtocol(next);
  }

  function addLiveTranscript(text: string) {
    liveProtocolQueue.current = liveProtocolQueue.current.catch(() => undefined).then(async () => {
      const response = await fetch("/api/telefon/protokoll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, protocol: protocolRef.current }),
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; protocol?: Protocol };
      if (response.ok && result.ok && result.protocol) applyProtocol(result.protocol);
    });
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/gesundheit")
      .then((response) => response.json())
      .then((result: { voice?: { ready?: boolean } }) => { if (active) setVoiceReady(result.voice?.ready === true); })
      .catch(() => { if (active) setVoiceReady(false); });
    return () => { active = false; stream.current?.getTracks().forEach((track) => track.stop()); liveStream.current?.getTracks().forEach((track) => track.stop()); liveConnection.current?.close(); };
  }, []);

  async function sendAudio(blob: Blob) {
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("audio", blob, "sprechdemo.webm");
    form.append("history", JSON.stringify(messages.map((message) => ({ role: message.role === "bot" ? "assistant" : "user", content: message.text }))));
    form.append("protocol", JSON.stringify(protocol));
    try {
      const response = await fetch("/api/telefon/sprechen", { method: "POST", body: form });
      const result = await response.json() as { ok?: boolean; error?: string; text?: string; reply?: string; audio?: string; mime?: string; protocol?: Protocol };
      if (!response.ok || !result.ok || !result.text || !result.reply) throw new Error(result.error ?? "Die lokale Sprachstrecke ist nicht verfügbar.");
      setMessages((current) => [...current, { role: "user", text: result.text! }, { role: "bot", text: result.reply! }]);
      if (result.protocol) applyProtocol(result.protocol);
      if (result.audio) {
        const audio = new Audio(`data:${result.mime ?? "audio/wav"};base64,${result.audio}`);
        void audio.play().catch(() => undefined);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sprachdemo fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setError("");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const next = new MediaRecorder(stream.current, { mimeType: mime });
      chunks.current = [];
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = () => { const blob = new Blob(chunks.current, { type: mime }); void sendAudio(blob); stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; };
      recorder.current = next;
      next.start();
      setRecording(true);
    } catch {
      setError("Mikrofon nicht verfügbar. Bitte Browser-Berechtigung prüfen oder unten Text eingeben.");
    }
  }

  function stop() {
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
  }

  function stopLive() {
    liveStream.current?.getTracks().forEach((track) => track.stop());
    liveStream.current = null;
    liveConnection.current?.close();
    liveConnection.current = null;
    liveAudio.current?.pause();
    liveAudio.current = null;
    liveTranscriptIds.current.clear();
    liveProtocolQueue.current = Promise.resolve();
    setLiveState("idle");
  }

  async function startLive() {
    setError("");
    setLiveState("connecting");
    try {
      const peer = new RTCPeerConnection();
      liveConnection.current = peer;
      const channel = peer.createDataChannel("oai-events");
      channel.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: string; item_id?: string; transcript?: string; error?: { message?: string } };
          if (message.type === "conversation.item.input_audio_transcription.completed" && message.transcript) {
            const id = message.item_id ?? message.transcript;
            if (!liveTranscriptIds.current.has(id)) {
              liveTranscriptIds.current.add(id);
              setMessages((current) => [...current, { role: "user", text: message.transcript! }]);
              void addLiveTranscript(message.transcript);
            }
          }
          if (message.type === "response.output_audio_transcript.done" && message.transcript) setMessages((current) => [...current, { role: "bot", text: message.transcript! }]);
          if (message.type === "error") setError(message.error?.message ?? "OpenAI-Live konnte das Gespräch nicht fortsetzen.");
        } catch { /* Ein unbekanntes Live-Ereignis wird für die Anzeige nicht benötigt. */ }
      };
      peer.ontrack = (event) => {
        const audio = new Audio();
        audio.autoplay = true;
        audio.srcObject = event.streams[0];
        liveAudio.current = audio;
        void audio.play().catch(() => undefined);
      };
      peer.onconnectionstatechange = () => { if (["failed", "closed", "disconnected"].includes(peer.connectionState)) setLiveState("idle"); };

      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      liveStream.current = microphone;
      microphone.getTracks().forEach((track) => peer.addTrack(track, microphone));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const answerResponse = await fetch("/api/telefon/live-connect", { method: "POST", headers: { "Content-Type": "application/sdp" }, body: offer.sdp });
      if (!answerResponse.ok) { const body = await answerResponse.json().catch(() => ({})); throw new Error(String(body.error ?? "OpenAI-Live konnte die Audioverbindung nicht aufbauen.")); }
      await peer.setRemoteDescription({ type: "answer", sdp: await answerResponse.text() });
      setLiveState("live");
    } catch (caught) {
      stopLive();
      setError(caught instanceof Error ? caught.message : "OpenAI-Live konnte nicht gestartet werden.");
    }
  }

  function transferToForm() {
    sessionStorage.setItem("garagen-complaint-draft", JSON.stringify({
      location: protocol.location,
      category: protocol.category,
      priority: protocol.priority,
      occurredAt: protocol.occurredAt,
      contactPhone: protocol.callback,
      description: protocol.summary,
    }));
    window.location.assign("/#formular");
  }

  async function sendText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setText("");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/telefon/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: value, history: messages.map((message) => ({ role: message.role === "bot" ? "assistant" : "user", content: message.text })), protocol }) });
      const result = await response.json() as { ok?: boolean; error?: string; reply?: string; protocol?: Protocol };
      if (!response.ok || !result.ok || !result.reply) throw new Error(result.error ?? "Lokales Antwortmodell nicht verfügbar.");
      setMessages((current) => [...current, { role: "user", text: value }, { role: "bot", text: result.reply! }]);
      if (result.protocol) applyProtocol(result.protocol);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Chat fehlgeschlagen."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
    <div className="mx-auto max-w-3xl">
      <a href="/" className="text-sm font-semibold text-primary">← Zurück zur Homepage</a>
      <p className="mt-12 text-xs font-bold tracking-[0.2em] text-orange-700">PC-SPRECHDEMO · LOKAL</p>
      <h1 className="mt-3 font-display text-5xl leading-tight">Sprechen Sie mit dem Kundenservice-Bot.</h1>
      <p className="mt-5 max-w-2xl text-lg text-muted-foreground">Wie bei Silvia: Mikrofon drücken, Anliegen schildern, Antwort hören. Die Demo verarbeitet Audio ausschließlich über Whisper und Piper auf diesem Rechner und speichert keinen Gesprächsverlauf.</p>
      <section className="mt-10 rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-9">
        <div className="space-y-3" aria-live="polite">
          {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.role === "bot" ? "bg-green-100" : "ml-auto bg-secondary"}`}><div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{message.role === "bot" ? "Kundenservice-Bot" : "Sie"}</div>{message.text}</div>)}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => recording ? stop() : void start()} disabled={busy || liveState !== "idle"} className={`rounded-full px-6 py-3 font-bold text-white ${recording ? "bg-red-700" : "bg-primary"}`}>{recording ? "Aufnahme beenden" : "Lokales Mikrofon"}</button>
          <button type="button" onClick={() => liveState === "live" ? stopLive() : void startLive()} disabled={busy || liveState === "connecting"} className={`rounded-full px-6 py-3 font-bold text-white ${liveState === "live" ? "bg-red-700" : "bg-orange-700"}`}>{liveState === "connecting" ? "OpenAI-Live verbindet …" : liveState === "live" ? "Live-Gespräch beenden" : "OpenAI-Live starten"}</button>
          <span className="text-sm text-muted-foreground">{liveState === "live" ? "Live-Gespräch aktiv: sprechen Sie ganz natürlich oder unterbrechen Sie die Antwort." : busy ? "Lokale Stimme verarbeitet …" : recording ? "Sie können jetzt sprechen." : voiceReady === null ? "Lokale Stimme wird geprüft …" : voiceReady ? "Lokale Stimme bereit. Keine externe KI aktiv." : "Lokale Stimme ist noch nicht gestartet. Text funktioniert weiterhin."}</span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">OpenAI-Live ist optional. Mit dem Start stimmen Sie zu, dass das Gesprächsaudio für diese Sitzung an OpenAI übertragen wird.</p>
        <form onSubmit={sendText} className="mt-6 flex gap-3"><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Text-Fallback für die Vorführung …" className="min-w-0 flex-1 rounded-xl border border-input bg-background px-4 py-3" aria-label="Text-Fallback" /><button className="rounded-xl bg-secondary px-4 py-3 font-bold" type="submit">Senden</button></form>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-100 p-3 text-sm text-red-900">{error}</p>}
      </section>
      <section className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-soft"><p className="text-xs font-bold tracking-[0.2em] text-orange-700">LIVE-PROTOKOLL</p><h2 className="mt-2 font-display text-2xl">Wird während des Gesprächs aufgebaut</h2><dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="font-bold text-muted-foreground">Standort</dt><dd>{protocol.location || "noch offen"}</dd></div><div><dt className="font-bold text-muted-foreground">Kategorie</dt><dd>{protocol.category || "noch offen"}</dd></div><div><dt className="font-bold text-muted-foreground">Dringlichkeit</dt><dd>{protocol.priority}</dd></div><div><dt className="font-bold text-muted-foreground">Zeitpunkt</dt><dd>{protocol.occurredAt || "noch offen"}</dd></div><div><dt className="font-bold text-muted-foreground">Rückrufnummer</dt><dd>{protocol.callback || "noch offen"}</dd></div><div className="sm:col-span-2"><dt className="font-bold text-muted-foreground">Zusammenfassung</dt><dd>{protocol.summary || "Noch keine Zusammenfassung."}</dd></div></dl></section>
      <section className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-soft"><h2 className="font-display text-2xl">Angaben übernehmen</h2><p className="mt-2 text-sm text-muted-foreground">Die Gesprächsangaben werden erst mit Ihrer Einwilligung im Formular gespeichert. Bis dahin bleibt diese Vorführung lokal im Browser.</p><button type="button" onClick={transferToForm} className="mt-4 rounded-full bg-primary px-5 py-3 font-bold text-white">Ins Beschwerdeformular übernehmen</button></section>
      <p className="mt-6 text-sm text-muted-foreground">Demo-Modus: keine echte Telefonleitung und keine Weitergabe an Best in Parking.</p>
    </div>
  </main>;
}
