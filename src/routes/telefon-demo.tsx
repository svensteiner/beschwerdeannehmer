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
  const [protocol, setProtocol] = useState<Protocol>({ location: "", category: "", priority: "normal", occurredAt: "", summary: "", callback: "" });
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => () => stream.current?.getTracks().forEach((track) => track.stop()), []);

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
      if (result.protocol) setProtocol(result.protocol);
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
      if (result.protocol) setProtocol(result.protocol);
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
          <button type="button" onClick={() => recording ? stop() : void start()} disabled={busy} className={`rounded-full px-6 py-3 font-bold text-white ${recording ? "bg-red-700" : "bg-primary"}`}>{recording ? "Aufnahme beenden" : "Mikrofon starten"}</button>
          <span className="text-sm text-muted-foreground">{busy ? "Lokale Stimme verarbeitet …" : recording ? "Sie können jetzt sprechen." : "Keine externe KI aktiv."}</span>
        </div>
        <form onSubmit={sendText} className="mt-6 flex gap-3"><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Text-Fallback für die Vorführung …" className="min-w-0 flex-1 rounded-xl border border-input bg-background px-4 py-3" aria-label="Text-Fallback" /><button className="rounded-xl bg-secondary px-4 py-3 font-bold" type="submit">Senden</button></form>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-100 p-3 text-sm text-red-900">{error}</p>}
      </section>
      <section className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-soft"><p className="text-xs font-bold tracking-[0.2em] text-orange-700">LIVE-PROTOKOLL</p><h2 className="mt-2 font-display text-2xl">Wird während des Gesprächs aufgebaut</h2><dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="font-bold text-muted-foreground">Standort</dt><dd>{protocol.location || "noch offen"}</dd></div><div><dt className="font-bold text-muted-foreground">Kategorie</dt><dd>{protocol.category || "noch offen"}</dd></div><div><dt className="font-bold text-muted-foreground">Dringlichkeit</dt><dd>{protocol.priority}</dd></div><div><dt className="font-bold text-muted-foreground">Zeitpunkt</dt><dd>{protocol.occurredAt || "noch offen"}</dd></div><div className="sm:col-span-2"><dt className="font-bold text-muted-foreground">Zusammenfassung</dt><dd>{protocol.summary || "Noch keine Zusammenfassung."}</dd></div></dl></section>
      <p className="mt-6 text-sm text-muted-foreground">Demo-Modus: keine echte Telefonleitung, keine automatische Beschwerdeanlage und keine Weitergabe an Best in Parking.</p>
    </div>
  </main>;
}
