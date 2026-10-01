import { createFileRoute } from "@tanstack/react-router";
import { liveDemoBodyLimit, liveDemoMutationAllowed, readLiveDemoBody } from "@/lib/live-demo.server";
import { startLiveCall } from "@/lib/live/call.server";

/** Öffentlicher Live-Anruf einer Praxisleitung. Gleiche Herkunft Pflicht, Größe begrenzt, Politik im Kern. */
export const Route = createFileRoute("/api/live/create")({
  server: { handlers: {
    POST: async ({ request }) => {
      if (!liveDemoMutationAllowed(request)) return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
      if (!liveDemoBodyLimit(request)) return Response.json({ error: "Anfrage zu groß." }, { status: 413 });
      const raw = await readLiveDemoBody(request);
      if (raw === null) return Response.json({ error: "Anfrage zu groß." }, { status: 413 });
      let body: { slug?: unknown; sdp?: unknown };
      try { body = JSON.parse(raw) as typeof body; } catch { return Response.json({ error: "Ungültiges JSON." }, { status: 400 }); }
      const slug = typeof body.slug === "string" ? body.slug.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 48) : "";
      const trimmed = typeof body.sdp === "string" ? body.sdp.trim() : "";
      if (!slug || !trimmed || trimmed.length > 240_000) return Response.json({ error: "Angaben fehlen oder sind zu groß." }, { status: 400 });
      // SDP verlangt ein abschließendes Zeilenende.
      const sdp = trimmed + String.fromCharCode(13, 10);
      const result = await startLiveCall({ slug, sdp });
      return Response.json(result.body, { status: result.status });
    },
  } },
});
