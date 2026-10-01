import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tafel-holen")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { peekDeskHolenStatus, deskHolenPeekResponse } = await import(
            "@/lib/practice/desk-backup-holen.server"
          );
          const { holenPeekCookieOn } = await import("@/lib/practice/desk-storage");
          return deskHolenPeekResponse(
            await peekDeskHolenStatus(holenPeekCookieOn(request.headers.get("cookie"))),
          );
        } catch {
          const { TAFEL_HOLEN_HTTP_FAIL } = await import("@/lib/practice/desk-storage");
          return Response.json({ ok: false, error: TAFEL_HOLEN_HTTP_FAIL }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const { applyDeskHolenForm, deskHolenHttpResponse } = await import(
            "@/lib/practice/desk-backup-holen.server"
          );
          const { holenBodyTooLarge, DESK_BACKUP_TOO_LARGE } = await import(
            "@/lib/practice/desk-storage"
          );
          if (holenBodyTooLarge(request.headers.get("content-length"))) {
            return deskHolenHttpResponse({ ok: false, error: DESK_BACKUP_TOO_LARGE, status: 400 });
          }
          let form: FormData;
          try {
            form = await request.formData();
          } catch {
            form = new FormData();
          }
          return deskHolenHttpResponse(await applyDeskHolenForm(form));
        } catch {
          const { TAFEL_HOLEN_HTTP_FAIL } = await import("@/lib/practice/desk-storage");
          return Response.json({ ok: false, error: TAFEL_HOLEN_HTTP_FAIL }, { status: 500 });
        }
      },
    },
  },
});
