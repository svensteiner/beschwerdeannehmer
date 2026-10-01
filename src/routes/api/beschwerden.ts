import { createFileRoute } from "@tanstack/react-router";
import { deleteComplaint, listComplaints, purgeExpiredComplaints, saveComplaint, updateComplaintStatus, type ComplaintStatus } from "@/lib/beschwerden/store.server";
import { validateComplaint } from "@/lib/beschwerden/validation";
import { allowComplaintRequest } from "@/lib/beschwerden/rate-limit.server";
import { sortComplaintsForInbox } from "@/lib/beschwerden/inbox";
import { hasOperatorKey } from "@/lib/beschwerden/operator-auth.server";

export const Route = createFileRoute("/api/beschwerden")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!hasOperatorKey(request.headers.get("x-garagen-operator"))) return Response.json({ ok: false, error: "Nicht autorisiert." }, { status: 401 });
        await purgeExpiredComplaints();
        const complaints = sortComplaintsForInbox(await listComplaints());
        return Response.json({ ok: true, complaints }, { headers: { "Cache-Control": "no-store" } });
      },
      POST: async ({ request }) => {
        if (!allowComplaintRequest(request)) return Response.json({ ok: false, error: "Zu viele Einsendungen. Bitte später erneut versuchen." }, { status: 429, headers: { "Retry-After": "600" } });
        const declaredLength = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declaredLength) && declaredLength > 64 * 1024) return Response.json({ ok: false, error: "Die Anfrage ist zu groß." }, { status: 413 });
        const rawBody = await request.text().catch(() => "");
        if (new TextEncoder().encode(rawBody).byteLength > 64 * 1024) return Response.json({ ok: false, error: "Die Anfrage ist zu groß." }, { status: 413 });
        const body = (() => { try { return JSON.parse(rawBody); } catch { return null; } })();
        const validation = validateComplaint(body);
        if (!validation.ok) return Response.json(validation, { status: 400 });
        const { location, category, description, name, email, occurredAt, contactPhone, priority } = validation.value;
        const reference = `GW-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        await saveComplaint({ reference, createdAt: new Date().toISOString(), location, category, description, name, email, occurredAt, contactPhone, priority });
        return Response.json({ ok: true, reference }, { status: 201, headers: { "Cache-Control": "no-store" } });
      },
      PATCH: async ({ request }) => {
        if (!hasOperatorKey(request.headers.get("x-garagen-operator"))) return Response.json({ ok: false, error: "Nicht autorisiert." }, { status: 401 });
        const body = await request.json().catch(() => null) as { reference?: unknown; status?: unknown; response?: unknown } | null;
        const status = String(body?.status ?? "") as ComplaintStatus;
        const response = body?.response === undefined ? undefined : String(body.response).trim();
        if (!body?.reference || !["neu", "in_pruefung", "beantwortet", "geschlossen"].includes(status) || (response !== undefined && response.length > 5000)) return Response.json({ ok: false, error: "Ungültiger Status oder Antworttext." }, { status: 400 });
        const complaint = await updateComplaintStatus(String(body.reference), status, response);
        return complaint ? Response.json({ ok: true, complaint }) : Response.json({ ok: false, error: "Vorgang nicht gefunden." }, { status: 404 });
      },
      DELETE: async ({ request }) => {
        if (!hasOperatorKey(request.headers.get("x-garagen-operator"))) return Response.json({ ok: false, error: "Nicht autorisiert." }, { status: 401 });
        const body = await request.json().catch(() => null) as { reference?: unknown } | null;
        if (!body?.reference) return Response.json({ ok: false, error: "Vorgangsnummer fehlt." }, { status: 400 });
        return (await deleteComplaint(String(body.reference))) ? Response.json({ ok: true }) : Response.json({ ok: false, error: "Vorgang nicht gefunden." }, { status: 404 });
      },
    },
  },
});
