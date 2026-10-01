import { useEffect } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { BOARD_POLL_MS, boardPollShouldTick, deskFieldsBusy } from "@/lib/practice/board-poll";

/** Keep Tafel loaders fresh on /app and staff /sprechen — skip Einstellungen, public pages, and typing. */
export function useBoardPoll() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (typeof document === "undefined") return;

    const tick = () => {
      if (
        !boardPollShouldTick({
          visible: document.visibilityState === "visible",
          pathname,
          busy: deskFieldsBusy(document.activeElement),
        })
      ) {
        return;
      }
      void router.invalidate();
    };

    const id = setInterval(tick, BOARD_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, pathname]);
}
