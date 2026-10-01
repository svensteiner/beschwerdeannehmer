import { createFileRoute } from "@tanstack/react-router";
import { saveComplaint, updateComplaintStatus, type ComplaintStatus } from "@/lib/beschwerden/store.server";

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
        await saveComplaint({ reference, createdAt: new Date().toISOString(), location, category, description, name, email });
        return Response.json({ ok: true, reference }, { status: 201, headers: { "Cache-Control": "no-store" } });
      },
      PATCH: async ({ request }) => {
        const expected = process.env.GARAGEN_OPERATOR_KEY;
        if (!expected || request.headers.get("x-garagen-operator") !== expected) return Response.json({ ok: false, error: "Nicht autorisiert." }, { status: 401 });
        const body = await request.json().catch(() => null) as { reference?: unknown; status?: unknown } | null;
        const status = String(body?.status ?? "") as ComplaintStatus;
        if (!body?.reference || !["neu", "in_pruefung", "beantwortet", "geschlossen"].includes(status)) return Response.json({ ok: false, error: "Ungültiger Status." }, { status: 400 });
        const complaint = await updateComplaintStatus(String(body.reference), status);
        return complaint ? Response.json({ ok: true, complaint }) : Response.json({ ok: false, error: "Vorgang nicht gefunden." }, { status: 404 });
      },
    },
  },
});
