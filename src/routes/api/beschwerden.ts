import { createFileRoute } from "@tanstack/react-router";

const categories = new Set([
  "Ein-/Ausfahrt",
  "Parkplatz oder Schranke",
  "Abrechnung",
  "Sauberkeit oder Sicherheit",
  "Sonstiges",
]);

export const Route = createFileRoute("/api/beschwerden")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null) as Record<string, unknown> | null;
        const location = String(body?.location ?? "").trim();
        const category = String(body?.category ?? "").trim();
        const description = String(body?.description ?? "").trim();
        const name = String(body?.name ?? "").trim();
        const email = String(body?.email ?? "").trim();
        if (!location || !categories.has(category) || description.length < 20 || !name || !email.includes("@")) {
          return Response.json({ ok: false, error: "Bitte alle Pflichtfelder korrekt ausfüllen." }, { status: 400 });
        }
        const reference = `GW-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        return Response.json({ ok: true, reference }, { status: 201, headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
