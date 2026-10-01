import { createFileRoute } from "@tanstack/react-router";
import { hasOperatorKey } from "@/lib/beschwerden/operator-auth.server";

export const Route = createFileRoute("/api/gesundheit")({
  server: {
    handlers: {
      GET: async () => Response.json(
        { ok: true, ready: hasOperatorKey(process.env.GARAGEN_OPERATOR_KEY ?? null), operatorConfigured: Boolean(process.env.GARAGEN_OPERATOR_KEY) },
        { headers: { "Cache-Control": "no-store" } },
      ),
    },
  },
});
