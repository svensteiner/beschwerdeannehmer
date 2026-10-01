import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/pms-sync")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { runPmsSync, pmsSyncHttpResponse } = await import("@/lib/practice/pms-sync.server");
          return pmsSyncHttpResponse(await runPmsSync());
        } catch {
          return Response.json({ error: "Synchronisierung fehlgeschlagen." }, { status: 500 });
        }
      },
      GET: async () => Response.json({ error: "Method Not Allowed" }, { status: 405 }),
    },
  },
});
