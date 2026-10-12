import { createFileRoute } from "@tanstack/react-router";
import { openAiLiveEnabled } from "@/lib/beschwerden/live-access.server";

export const Route = createFileRoute("/api/telefon/live-status")({
  server: { handlers: { GET: async () => Response.json({ enabled: openAiLiveEnabled() }, { headers: { "Cache-Control": "no-store" } }) } },
});
