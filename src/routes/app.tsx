import { useEffect } from "react";
import { toast } from "sonner";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import { getPracticeSession } from "@/lib/practice/auth";
import { loadBoard } from "@/lib/practice/board";
import { takeHolenOutcome, TAFEL_HOLEN_WAIT_HREF } from "@/lib/practice/desk-storage";
import { peekAppHolenPending } from "@/lib/practice/holen-wait-gate";
import { deskLoginNextFromLocation } from "@/lib/practice/desk-session";
import { unreadInternCount } from "@/lib/practice/desk-calls";
import { useAnzeigeRefresh } from "@/lib/practice/use-anzeige-refresh";
import { useBoardPoll } from "@/lib/practice/use-board-poll";
import { practiceNeedsSetup } from "@/lib/practice/setup-wizard";

export const Route = createFileRoute("/app")({
  beforeLoad: async ({ location }) => {
    if (await peekAppHolenPending()) {
      throw redirect({
        to: TAFEL_HOLEN_WAIT_HREF,
        search: { next: deskLoginNextFromLocation(location) ?? "/app" },
      });
    }
    const session = await getPracticeSession();
    if (!session) {
      const next = deskLoginNextFromLocation(location) ?? "/app";
      throw redirect({ to: "/login", search: { next } });
    }
    return { session };
  },
  loader: async () => loadBoard(),
  component: AppLayout,
});

function AppLayout() {
  const { session } = Route.useRouteContext();
  const data = Route.useLoaderData();
  const holenError = data.ok ? data.holenError : null;
  useEffect(() => {
    const outcome = takeHolenOutcome({
      storage: typeof localStorage === "undefined" ? null : localStorage,
      holenError,
    });
    if (outcome?.kind === "ok") toast.success(outcome.text);
    if (outcome?.kind === "error") toast.error(outcome.text);
  }, [data.ok, holenError]);
  useBoardPoll();
  useAnzeigeRefresh(Boolean(data.ok && data.anzeige), data.ok ? data.writerCopySeq ?? 0 : 0);
  const unreadProtocol = data.ok ? unreadInternCount(data.threads) : 0;
  const setupIncomplete = Boolean(data.ok && !data.anzeige && practiceNeedsSetup(data.contact));
  return (
    <AppShell
      session={session}
      contact={data.ok ? { practiceName: data.contact.practiceName, city: data.contact.city } : null}
      unreadProtocol={unreadProtocol}
      anzeige={data.ok ? Boolean(data.anzeige) : false}
      writerCopySeq={data.ok ? data.writerCopySeq ?? 0 : 0}
      restart={data.ok ? data.restart ?? null : null}
      setupIncomplete={setupIncomplete}
      thirdPartyLlm={data.ok ? Boolean(data.thirdPartyLlm) : false}
    >
      <Outlet />
    </AppShell>
  );
}
