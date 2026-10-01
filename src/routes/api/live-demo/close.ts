import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP } from "@tanstack/react-start/server";
import { closeLiveDemoForId, liveDemoRequestAllowed, liveDemoLoopback, liveDemoMutationAllowed, readLiveDemoBody } from "@/lib/live-demo.server";

export const Route = createFileRoute("/api/live-demo/close")({
  server: { handlers: {
    POST: async ({ request }) => {
      const requestIP = getRequestIP();
      if (!liveDemoLoopback(request, requestIP) || !liveDemoMutationAllowed(request) || !liveDemoRequestAllowed(request)) return Response.json({ error: "Nur lokal erreichbar." }, { status: 403 });
      let body: { sessionId?: unknown } = {};
      const raw = await readLiveDemoBody(request);
      if (raw === null) return Response.json({ error: "Anfrage zu groß." }, { status: 413 });
      try { body = JSON.parse(raw) as { sessionId?: unknown }; } catch { return Response.json({ error: "Ungültiges JSON." }, { status: 400 }); }
      const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
      if (!sessionId || sessionId.length > 200) return Response.json({ error: "Sitzung fehlt." }, { status: 400 });
      return Response.json({ ok: closeLiveDemoForId(sessionId) });
    },
  } },
});
