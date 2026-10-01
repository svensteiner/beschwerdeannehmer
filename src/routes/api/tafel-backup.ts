import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tafel-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Runde 10 Punkt 18: die Sicherung wird mit einem vom Browser
          // mitgegebenen Passwort verschlüsselt. POST statt GET, damit das
          // Passwort nicht in der URL landet.
          const { inspectRequestBodyLimit } = await import("@/lib/alma/request-size-guard");
          // Der Body ist nur ein Passwort (max. 200 Zeichen) — 4 KiB sind großzügig.
          const limited = await inspectRequestBodyLimit(request, 4 * 1024);
          if (limited !== "ok") {
            void request.body?.cancel().catch(() => {});
            return new Response("Request body too large", { status: 413 });
          }
          let passphrase = "";
          try {
            const body = (await request.json()) as { passphrase?: unknown };
            passphrase = typeof body?.passphrase === "string" ? body.passphrase : "";
          } catch {
            /* fehlender oder kaputter Body -> leeres Passwort, wird abgelehnt */
          }
          const { buildDeskBackup, deskBackupHttpResponse } = await import(
            "@/lib/practice/desk-backup-dump.server"
          );
          return deskBackupHttpResponse(await buildDeskBackup(passphrase));
        } catch {
          const { TAFEL_BACKUP_FAIL } = await import("@/lib/practice/desk-storage");
          return Response.json({ error: TAFEL_BACKUP_FAIL }, { status: 500 });
        }
      },
    },
  },
});
