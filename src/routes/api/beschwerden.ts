import { createFileRoute } from "@tanstack/react-router";
import { listComplaints, saveComplaint, updateComplaintStatus, type ComplaintStatus } from "@/lib/beschwerden/store.server";
import { validateComplaint } from "@/lib/beschwerden/validation";
import { allowComplaintRequest } from "@/lib/beschwerden/rate-limit.server";

export const Route = createFileRoute("/api/beschwerden")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const expected = process.env.GARAGEN_OPERATOR_KEY;
        if (!expected || request.headers.get("x-garagen-operator") !== expected) return Response.json({ ok: false, error: "Nicht autorisiert." }, { status: 401 });
        return Response.json({ ok: true, complaints: await listComplaints() }, { headers: { "Cache-Control": "no-store" } });
      },
      POST: async ({ request }) => {
        if (!allowComplaintRequest(request)) return Response.json({ ok: false, error: "Zu viele Einsendungen. Bitte später erneut versuchen." }, { status: 429, headers: { "Retry-After": "600" } });
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
        const body = await request.json().catch(() => null) as { reference?: unknown; status?: unknown; response?: unknown } | null;
        const status = String(body?.status ?? "") as ComplaintStatus;
        const response = body?.response === undefined ? undefined : String(body.response).trim();
        if (!body?.reference || !["neu", "in_pruefung", "beantwortet", "geschlossen"].includes(status) || (response !== undefined && response.length > 5000)) return Response.json({ ok: false, error: "Ungültiger Status oder Antworttext." }, { status: 400 });
        const complaint = await updateComplaintStatus(String(body.reference), status, response);
        return complaint ? Response.json({ ok: true, complaint }) : Response.json({ ok: false, error: "Vorgang nicht gefunden." }, { status: 404 });
      },
    },
  },
});
