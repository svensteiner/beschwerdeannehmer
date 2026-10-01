import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/gesundheit")({
  server: {
    handlers: {
      GET: async () => Response.json(
        { ok: true, ready: Boolean(process.env.GARAGEN_OPERATOR_KEY), operatorConfigured: Boolean(process.env.GARAGEN_OPERATOR_KEY) },
        { headers: { "Cache-Control": "no-store" } },
      ),
    },
  },
});
