import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP } from "@tanstack/react-start/server";
import {
  createLiveDemoSession,
  liveDemoBodyLimit,
  liveDemoMutationAllowed,
  readLiveDemoBody,
  liveDemoLoopback,
  liveDemoRequestAllowed,
} from "@/lib/live-demo.server";

export const Route = createFileRoute("/api/live-demo/create")({
  server: { handlers: {
    POST: async ({ request }) => {
      const requestIP = getRequestIP();
      if (!liveDemoLoopback(request, requestIP) || !liveDemoMutationAllowed(request) || !liveDemoRequestAllowed(request)) return Response.json({ error: "Nur lokal erreichbar." }, { status: 403 });
      if (!liveDemoBodyLimit(request)) return Response.json({ error: "Anfrage zu groß." }, { status: 413 });
      let body: { sdp?: unknown };
      const raw = await readLiveDemoBody(request);
      if (raw === null) return Response.json({ error: "Anfrage zu groß." }, { status: 413 });
      try { body = JSON.parse(raw) as { sdp?: unknown }; } catch { return Response.json({ error: "Ungültiges JSON." }, { status: 400 }); }
      // SDP verlangt ein abschließendes Zeilenende; trim() hat es entfernt und OpenAI lehnte das Angebot ab.
      const trimmed = typeof body.sdp === "string" ? body.sdp.trim() : "";
      const sdp = trimmed ? trimmed + String.fromCharCode(13, 10) : "";
      if (!sdp || sdp.length > 240_000) return Response.json({ error: "SDP-Angebot fehlt oder ist zu groß." }, { status: 400 });
      try {
        const result = await createLiveDemoSession(sdp);
        return Response.json(result.body, { status: result.status });
      } catch {
        return Response.json({ error: "Die Live-Hörprobe konnte nicht gestartet werden." }, { status: 502 });
      }
    },
  } },
});
