import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP } from "@tanstack/react-start/server";
import { liveDemoLoopback, liveDemoOriginAllowed, liveDemoStatus } from "@/lib/live-demo.server";

export const Route = createFileRoute("/api/live-demo/status")({
  server: { handlers: {
    GET: async ({ request }) => {
      if (!liveDemoLoopback(request, getRequestIP()) || !liveDemoOriginAllowed(request)) {
        return Response.json({ error: "Nur lokal erreichbar." }, { status: 403 });
      }
      return Response.json(liveDemoStatus());
    },
  } },
});
