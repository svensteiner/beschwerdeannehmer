import { createFileRoute } from "@tanstack/react-router";
import { resolveLivePolicy } from "@/lib/live/policy";

/** Öffentlich: nur ob Live angeboten wird, nie warum nicht (keine Konfigurationsdetails). */
export const Route = createFileRoute("/api/live/status")({
  server: { handlers: {
    GET: async () => {
      const available = resolveLivePolicy().ok && process.env.SILVIA_LIVE_PLAN !== "budget";
      return Response.json({ available }, { headers: { "Cache-Control": "no-store" } });
    },
  } },
});
