import { createFileRoute } from "@tanstack/react-router";
import { listComplaints, saveComplaint, updateComplaintStatus, type ComplaintStatus } from "@/lib/beschwerden/store.server";
import { validateComplaint } from "@/lib/beschwerden/validation";

export const Route = createFileRoute("/api/beschwerden")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const expected = process.env.GARAGEN_OPERATOR_KEY;
        if (!expected || request.headers.get("x-garagen-operator") !== expected) return Response.json({ ok: false, error: "Nicht autorisiert." }, { status: 401 });
        return Response.json({ ok: true, complaints: await listComplaints() }, { headers: { "Cache-Control": "no-store" } });
      },
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null);
        const validation = validateComplaint(body);
        if (!validation.ok) return Response.json(validation, { status: 400 });
        const { location, category, description, name, email } = validation.value;
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
