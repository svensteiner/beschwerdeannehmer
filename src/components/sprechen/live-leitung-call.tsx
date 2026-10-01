import { Mic, PhoneOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Phase = "idle" | "starting" | "live" | "unavailable";

/**
 * Optionaler Live-Anruf über die öffentliche Leitung. Erscheint nur, wenn der Server Live
 * freigegeben hat. Sonst bleibt der normale Anruf darunter die einzige Möglichkeit.
 * Mikrofonton geht an die Live-Stimme, gespeichert wird nur eine Textnotiz.
 */
export function LiveLeitungCall({ slug }: { slug: string }) {
  const [available, setAvailable] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/live/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((s: { available?: boolean }) => { if (!cancelled) setAvailable(s.available === true); })
      .catch(() => { if (!cancelled) setAvailable(false); });
    return () => { cancelled = true; };
  }, []);

  const teardown = () => {
    try { dcRef.current?.send(JSON.stringify({ type: "session.close" })); } catch { /* Kanal schon zu */ }
    dcRef.current?.close();
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioRef.current) audioRef.current.srcObject = null;
    dcRef.current = null; pcRef.current = null; streamRef.current = null;
  };
  useEffect(() => teardown, []);

  const start = async () => {
    setPhase("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (m) => {
        try { if ((JSON.parse(m.data) as { type?: string }).type === "session.closed") { teardown(); setPhase("idle"); } } catch { /* ignorieren */ }
      };
      pc.ontrack = (e) => {
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.srcObject = e.streams[0] ?? null;
        void audioRef.current.play().catch(() => undefined);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") { teardown(); setPhase("idle"); }
      };
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve();
        pc.addEventListener("icegatheringstatechange", () => { if (pc.iceGatheringState === "complete") resolve(); });
        setTimeout(resolve, 4000);
      });
      const res = await fetch("/api/live/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, sdp: pc.localDescription?.sdp ?? "" }),
      });
      const body = (await res.json()) as { transport?: { sdp?: string } };
      if (!res.ok || !body.transport?.sdp) { teardown(); setPhase("unavailable"); return; }
      await pc.setRemoteDescription({ type: "answer", sdp: body.transport.sdp });
      setPhase("live");
    } catch {
      teardown();
      setPhase("unavailable");
    }
  };

  if (!available) return null;
  return (
    <section id="leitung-live" className="mx-auto mt-6 max-w-lg px-4 sm:px-6" aria-label="Live-Anruf">
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-medium">Mit der Live-Stimme sprechen</p>
        <p id="leitung-live-hinweis" className="mt-1 text-xs text-muted-foreground">
          Sie sprechen mit einer digitalen Assistentin (KI). Ihre Stimme wird zur Verarbeitung an unseren
          Sprachdienstleister in der EU übertragen und nicht aufgezeichnet; gespeichert wird nur eine kurze
          Textnotiz für die Praxis. Bei Notfällen wird sofort an die Praxis weitergeleitet.
        </p>
        {phase === "live" ? (
          <Button id="leitung-live-stop" type="button" variant="destructive" className="mt-3 min-h-11" onClick={() => { teardown(); setPhase("idle"); }}>
            <PhoneOff className="mr-2 size-4" aria-hidden /> Auflegen
          </Button>
        ) : (
          <Button id="leitung-live-start" type="button" className="mt-3 min-h-11" disabled={phase === "starting"} onClick={() => void start()}>
            <Mic className="mr-2 size-4" aria-hidden /> {phase === "starting" ? "Verbinde …" : "Live anrufen"}
          </Button>
        )}
        {phase === "unavailable" ? (
          <p id="leitung-live-fallback" role="status" className="mt-2 text-xs text-muted-foreground">
            Die Live-Stimme ist gerade nicht verfügbar. Bitte nutzen Sie den normalen Anruf unten.
          </p>
        ) : null}
      </div>
    </section>
  );
}
